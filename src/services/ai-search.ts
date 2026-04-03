import * as cheerio from "cheerio";
import { webSearch } from "@/lib/searxng";
import { queryOllamaJson } from "@/lib/ai-provider";
import { extractPriceFromUrl } from "./price-extractor";

export interface ProductOffer {
  name: string;
  price: number;
  currency: string;
  url: string;
  retailer: string;
  image_url?: string;
  variant?: string;
}

// Only block obvious non-shopping domains
const BLOCKED_DOMAINS = [
  "reddit.com", "facebook.com", "twitter.com", "x.com", "instagram.com",
  "youtube.com", "tiktok.com", "pinterest.com", "linkedin.com",
  "wikipedia.org", "wikihow.com", "quora.com", "zhihu.com", "baidu.com",
  "trustpilot.com",
];

// Comparison sites — we scrape these for retailer links, then filter them from general results
const COMPARISON_DOMAINS = [
  "idealo.co.uk", "pricerunner.com", "kelkoo.co.uk",
  "pricespy.co.uk", "pricehunter.co.uk",
];

// URL patterns that indicate category/listing pages (not buyable product pages)
const CATEGORY_URL_PATTERNS = [
  /\/category\//i, /\/categories\//i, /\/content_cat\//i,
  /\/store\/our-brands\//i, /\/collections\//i, /\/browse\//i,
  /\/b\/bn_/i,  // eBay browse pages
  /\/product-category\//i, /\/shop\/?$/i,
];

export interface SizePrefs {
  [key: string]: string | undefined;
}

export async function searchProducts(
  query: string,
  _country?: string,
  currency?: string,
  excludeRetailers?: string[],
  sizePrefs?: SizePrefs,
  searchHint?: string
): Promise<ProductOffer[]> {
  const curr = currency || "GBP";
  const userExcluded = (excludeRetailers || []).map((r) => r.toLowerCase());

  // Step 1: Try comparison sites first (idealo, pricerunner, etc.)
  console.log(`[Search] Finding retailers for "${query}"...`);
  const compOffers = await scrapeComparisonSites(query, curr, userExcluded);

  if (compOffers.length >= 3) {
    console.log(`[Search] Got ${compOffers.length} offers from comparison sites, skipping general search`);
    return compOffers;
  }

  // Step 2: Fall back to general SearXNG search + Ollama filtering
  const searchQueries = buildSearchQueries(query, searchHint);
  console.log(`[Search] Searching via SearXNG (${searchQueries.length} queries)...`);
  const allResults = new Map<string, { title: string; url: string; content: string }>();

  for (const sq of searchQueries) {
    const results = await webSearch(sq, 30);
    for (const r of results) {
      if (!allResults.has(r.url)) {
        allResults.set(r.url, r);
      }
    }
  }

  if (allResults.size === 0 && compOffers.length === 0) {
    console.log(`[Search] No results found`);
    return [];
  }

  // Filter out blocked domains, excluded retailers, comparison sites, and category pages
  const filtered = Array.from(allResults.values()).filter((r) => {
    const urlLower = r.url.toLowerCase();
    if (BLOCKED_DOMAINS.some((d) => urlLower.includes(d))) return false;
    // Don't filter comparison sites — they're valid price sources too
    if (userExcluded.some((ex) => urlLower.includes(ex))) return false;
    if (CATEGORY_URL_PATTERNS.some((p) => p.test(urlLower))) return false;
    return true;
  });

  console.log(`[Search] ${allResults.size} results -> ${filtered.length} after filter`);

  // Try Ollama on filtered results
  let offers = filtered.length > 0
    ? await askOllamaToFilter(filtered.slice(0, 10), query, curr, sizePrefs)
    : [];

  if (offers.length < 2 && filtered.length > 10) {
    console.log(`[Search] Only ${offers.length} from first batch, trying next 10...`);
    const more = await askOllamaToFilter(filtered.slice(10, 20), query, curr, sizePrefs);
    offers = [...offers, ...more];
  }

  if (offers.length === 0 && filtered.length > 0) {
    console.log(`[Search] Ollama found nothing, trying URL pattern fallback...`);
    offers = fallbackUrlFilter(filtered, query, curr);
  }

  // Merge comparison site offers with general search offers (dedup by domain)
  const seenDomains = new Set(compOffers.map((o) => new URL(o.url).hostname));
  const merged = [
    ...compOffers,
    ...offers.filter((o) => {
      try { return !seenDomains.has(new URL(o.url).hostname); } catch { return true; }
    }),
  ];

  if (merged.length === 0) {
    console.log(`[Search] No product pages identified`);
    return [];
  }

  // Verify prices on live pages (skip offers that already have verified prices from comparison scrape)
  console.log(`[Search] Verifying ${merged.length} prices...`);
  const verified = await Promise.all(
    merged.map(async (offer) => {
      if (offer.price > 0) {
        // Already have a price from comparison site, just verify it's still live
        const extracted = await extractPriceFromUrl(offer.url, query, curr, offer.price);
        return {
          ...offer,
          price: extracted.price ?? offer.price,
          currency: extracted.currency || offer.currency || curr,
          name: extracted.name || offer.name,
          image_url: extracted.image_url || offer.image_url || undefined,
          variant: extracted.variant || offer.variant || undefined,
        };
      }
      const extracted = await extractPriceFromUrl(offer.url, query, curr);
      return {
        ...offer,
        price: extracted.price ?? 0,
        currency: extracted.currency || offer.currency || curr,
        name: extracted.name || offer.name,
        image_url: extracted.image_url || offer.image_url || undefined,
        variant: extracted.variant || offer.variant || undefined,
      };
    })
  );

  return verified
    .filter((o) => {
      if (o.price <= 0) return false;
      if (o.currency && o.currency !== curr) {
        console.log(`[Search] Dropped "${o.name}" — ${o.currency} not ${curr}`);
        return false;
      }
      return true;
    })
    .sort((a, b) => a.price - b.price);
}

/**
 * Search for the product on comparison sites (Idealo, PriceRunner, etc.)
 * and scrape retailer links + prices from their pages.
 */
async function scrapeComparisonSites(
  query: string,
  currency: string,
  excludeRetailers: string[]
): Promise<ProductOffer[]> {
  // Search SearXNG specifically for comparison site pages
  const compQueries = [
    `${query} site:idealo.co.uk`,
    `${query} site:pricerunner.com`,
  ];

  const compUrls: string[] = [];
  for (const q of compQueries) {
    const results = await webSearch(q, 5);
    for (const r of results) {
      if (COMPARISON_DOMAINS.some((d) => r.url.includes(d))) {
        compUrls.push(r.url);
      }
    }
  }

  if (compUrls.length === 0) {
    console.log(`[Comparison] No comparison pages found`);
    return [];
  }

  console.log(`[Comparison] Found ${compUrls.length} comparison pages, scraping...`);

  const allOffers: ProductOffer[] = [];
  const seenDomains = new Set<string>();

  for (const url of compUrls.slice(0, 3)) {
    try {
      const html = await fetchWithRetry(url);
      if (!html) continue;

      const offers = parseComparisonPage(html, url, query, currency);
      for (const offer of offers) {
        try {
          const domain = new URL(offer.url).hostname;
          if (seenDomains.has(domain)) continue;
          if (excludeRetailers.some((ex) => domain.includes(ex))) continue;
          seenDomains.add(domain);
          allOffers.push(offer);
        } catch { /* invalid URL */ }
      }
    } catch (err) {
      console.log(`[Comparison] Failed to scrape ${url}:`, (err as Error).message);
    }
  }

  console.log(`[Comparison] Extracted ${allOffers.length} retailer offers`);
  return allOffers;
}

/** Fetch a page with browser-like headers */
async function fetchWithRetry(url: string): Promise<string | null> {
  const headerSets: Record<string, string>[] = [
    {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      "Accept-Encoding": "identity",
    },
    {
      "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Accept": "text/html",
    },
  ];
  for (const headers of headerSets) {
    try {
      const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(15000) });
      if (res.ok) return await res.text();
      console.log(`[Comparison] HTTP ${res.status} for ${url}`);
    } catch (err) {
      console.log(`[Comparison] Fetch failed:`, (err as Error).message?.substring(0, 60));
    }
  }
  return null;
}

/** Parse a comparison site page for retailer links and prices */
function parseComparisonPage(
  html: string,
  sourceUrl: string,
  productName: string,
  currency: string
): ProductOffer[] {
  const $ = cheerio.load(html);
  const offers: ProductOffer[] = [];

  // Strategy 1: JSON-LD offers (many comparison sites embed these)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        const offerList = item.offers?.offers || item.offers || [];
        const offerArr = Array.isArray(offerList) ? offerList : [offerList];
        for (const o of offerArr) {
          if (o.url && o.price && o.seller?.name) {
            offers.push({
              name: item.name || productName,
              price: parseFloat(o.price) || 0,
              currency: o.priceCurrency || currency,
              url: o.url,
              retailer: o.seller.name,
            });
          }
        }
      }
    } catch { /* ignore parse errors */ }
  });

  if (offers.length > 0) {
    console.log(`[Comparison] JSON-LD: ${offers.length} offers from ${sourceUrl}`);
    return offers;
  }

  // Strategy 2: Links with outbound retailer URLs (common on Idealo/PriceRunner)
  // Look for links that go to external domains (not the comparison site itself)
  const compHost = new URL(sourceUrl).hostname;
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!href.startsWith("http")) return;

    try {
      const linkHost = new URL(href).hostname;
      // Skip internal links and comparison site links
      if (linkHost === compHost) return;
      if (COMPARISON_DOMAINS.some((d) => linkHost.includes(d))) return;
      if (BLOCKED_DOMAINS.some((d) => linkHost.includes(d))) return;
      if (seen.has(linkHost)) return;

      // Look for price text near the link
      const parent = $(el).closest("div, li, tr, section");
      const parentText = parent.text();
      const priceMatch = parentText.match(/[£$€]\s*([\d,]+\.?\d*)/);
      const price = priceMatch ? parseFloat(priceMatch[1].replace(",", "")) : 0;

      // Only include links that look like product/shop pages
      if (price > 0 || href.match(/\/(product|p|dp|item|content_prod)\//i)) {
        seen.add(linkHost);
        const retailer = linkHost.replace(/^www\./, "").split(".")[0];
        offers.push({
          name: productName,
          price,
          currency,
          url: href,
          retailer: retailer.charAt(0).toUpperCase() + retailer.slice(1),
        });
      }
    } catch { /* invalid URL */ }
  });

  if (offers.length > 0) {
    console.log(`[Comparison] Links: ${offers.length} offers from ${sourceUrl}`);
  }

  return offers;
}

/**
 * Build smart search queries based on the product and category hint.
 * Different categories need different search strategies.
 */
function buildSearchQueries(query: string, searchHint?: string): string[] {
  const queries: string[] = [
    `${query} buy online`,
    `${query} price £`,
  ];

  if (searchHint) {
    // Extract retailer names from the hint (e.g. "car parts retailers like Euro Car Parts, GSF, Autodoc")
    const likeMatch = searchHint.match(/like\s+(.+)/i);
    if (likeMatch) {
      const retailers = likeMatch[1].split(/,\s*/).map((r) => r.trim());
      // Search for the product on specific retailers
      for (const retailer of retailers.slice(0, 3)) {
        queries.push(`${query} ${retailer}`);
      }
    } else {
      queries.push(`${query} ${searchHint}`);
    }
  }

  // Always add a generic shopping query
  queries.push(`buy ${query} UK`);

  return queries;
}

async function askOllamaToFilter(
  results: { title: string; url: string; content: string }[],
  productName: string,
  currency: string,
  sizePrefs?: SizePrefs
): Promise<ProductOffer[]> {
  const sizeHints: string[] = [];
  if (sizePrefs) {
    for (const [key, val] of Object.entries(sizePrefs)) {
      if (val) {
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
        sizeHints.push(`${label}: ${val}`);
      }
    }
  }
  const sizeNote = sizeHints.length > 0 ? `\nUser sizes: ${sizeHints.join(", ")}.` : "";

  const resultsList = results.map((r, i) =>
    `${i + 1}. ${r.title} | ${r.url}`
  ).join("\n");

  console.log(`[Search] Asking Ollama to analyse ${results.length} results...`);

  const data = await queryOllamaJson(
    `Pick online shop URLs where I can buy a product. Return {"products":[{"name":"...","url":"...","retailer":"..."}]}`,
    `Product: "${productName}"${sizeNote}

${resultsList}

Which are real shop pages selling this product? Ignore reviews, blogs, forums, stickers, accessories. Return {"products":[]}} if none.`
  );

  if (!data || typeof data !== "object") {
    console.log(`[Search] Ollama returned no data`);
    return [];
  }

  const obj = data as Record<string, unknown>;
  const products = obj.products;
  if (!Array.isArray(products)) {
    console.log(`[Search] Ollama response has no products array`);
    return [];
  }

  console.log(`[Search] Ollama identified ${products.length} product pages`);

  return (products as Record<string, unknown>[])
    .map((o) => ({
      name: String(o.name || ""),
      price: Number(o.price) || 0,
      currency: String(o.currency || currency),
      url: String(o.url || ""),
      retailer: String(o.retailer || extractRetailerFromUrl(String(o.url || ""))),
      image_url: undefined,
      variant: o.variant ? String(o.variant) : undefined,
    }))
    .filter((o) => o.name && o.url && o.url.startsWith("http"));
}

/** Fallback: pick URLs that look like product pages based on URL patterns */
function fallbackUrlFilter(
  results: { title: string; url: string; content: string }[],
  productName: string,
  currency: string
): ProductOffer[] {
  const SHOP_PATTERNS = [
    /\/product[s]?\//i, /\/p\//i, /\/buy\//i, /\/item\//i,
    /\/content_prod\//i, /\/dp\//i, /\/gp\/product/i,
    /\/(helmet|glove|jacket|boot|intercom|exhaust|tyre|brake)/i,
  ];
  const NON_SHOP = [
    /\/blog\//i, /\/news\//i, /\/review[s]?\//i, /\/article/i,
    /\/forum/i, /\/wiki/i, /\/guide/i, /\/best-/i, /\/top-\d/i,
  ];

  const nameWords = productName.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  return results
    .filter((r) => {
      const urlLower = r.url.toLowerCase();
      if (NON_SHOP.some((p) => p.test(urlLower))) return false;
      const titleLower = r.title.toLowerCase();
      // Title must contain at least one word from the product name
      const hasMatch = nameWords.some((w) => titleLower.includes(w));
      if (!hasMatch) return false;
      // URL looks like a product page OR title contains price-like text
      return SHOP_PATTERNS.some((p) => p.test(urlLower)) || /£\d/.test(r.title + r.content);
    })
    .slice(0, 8)
    .map((r) => ({
      name: r.title,
      price: 0,
      currency,
      url: r.url,
      retailer: extractRetailerFromUrl(r.url),
      image_url: undefined,
      variant: undefined,
    }));
}

function extractRetailerFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const name = hostname.split(".")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return "Unknown";
  }
}
