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

  // Build search queries — generic plus category-specific
  const searchQueries = buildSearchQueries(query, searchHint);

  console.log(`[Search] Searching for "${query}" via SearXNG (${searchQueries.length} queries)...`);
  const allResults = new Map<string, { title: string; url: string; content: string }>();

  for (const sq of searchQueries) {
    const results = await webSearch(sq, 30);
    for (const r of results) {
      if (!allResults.has(r.url)) {
        allResults.set(r.url, r);
      }
    }
  }

  if (allResults.size === 0) {
    console.log(`[Search] No results found`);
    return [];
  }

  // Light domain filter
  const userExcluded = (excludeRetailers || []).map((r) => r.toLowerCase());
  const filtered = Array.from(allResults.values()).filter((r) => {
    const urlLower = r.url.toLowerCase();
    if (BLOCKED_DOMAINS.some((d) => urlLower.includes(d))) return false;
    if (userExcluded.some((ex) => urlLower.includes(ex))) return false;
    return true;
  });

  console.log(`[Search] ${allResults.size} results -> ${filtered.length} after domain filter`);
  if (filtered.length === 0) return [];

  // Ollama identifies actual product pages
  const offers = await askOllamaToFilter(filtered, query, curr, sizePrefs);

  if (offers.length === 0) {
    console.log(`[Search] No product pages identified`);
    return [];
  }

  // Verify prices on live pages
  console.log(`[Search] Verifying ${offers.length} prices...`);
  const verified = await Promise.all(
    offers.map(async (offer) => {
      const extracted = await extractPriceFromUrl(offer.url, query, curr, offer.price);
      return {
        ...offer,
        price: extracted.price ?? offer.price ?? 0,
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

  const resultsList = results.slice(0, 20).map((r, i) =>
    `${i + 1}. ${r.title} | ${r.url} | ${r.content.substring(0, 80)}`
  ).join("\n");

  console.log(`[Search] Asking Ollama to analyse ${Math.min(results.length, 20)} results...`);

  const data = await queryOllamaJson(
    `You identify product pages from search results. You must return a JSON object with a "products" array.`,
    `I want to buy: "${productName}"

Here are search results. Pick ONLY the ones that are online shop pages where I can BUY this exact product or a very close match. Include product pages AND category pages from real shops if they clearly sell this item.
${sizeNote}

${resultsList}

Return JSON: {"products": [{"name": "product name on page", "price": 0, "currency": "${currency}", "url": "the url", "retailer": "shop name", "variant": null}]}

Rules:
- Include pages from real online shops that sell this product
- A "graphic kit", "sticker", or unrelated accessory is NOT the product
- Review sites, forums, blogs, and news articles are NOT shops
- Set price to 0 if you can't see it in the snippet
- If NONE are relevant, return {"products": []}`
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

function extractRetailerFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const name = hostname.split(".")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return "Unknown";
  }
}
