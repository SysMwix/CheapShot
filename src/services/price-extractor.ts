import * as cheerio from "cheerio";

export interface ExtractedPrice {
  price: number | null;
  currency: string;
  name: string | null;
  image_url: string | null;
}

/**
 * Fetch a product page and extract the live price.
 * Uses Cheerio first (structured data), falls back to AI if needed.
 */
export async function extractPriceFromUrl(
  url: string,
  expectedProduct: string,
  expectedCurrency: string
): Promise<ExtractedPrice> {
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.log(`[PriceExtract] HTTP ${res.status} for ${url}`);
      return { price: null, currency: expectedCurrency, name: null, image_url: null };
    }

    html = await res.text();
  } catch (err) {
    console.log(`[PriceExtract] Fetch failed for ${url}:`, (err as Error).message);
    return { price: null, currency: expectedCurrency, name: null, image_url: null };
  }

  if (html.length < 100) {
    return { price: null, currency: expectedCurrency, name: null, image_url: null };
  }

  // Step 1: Try Cheerio structured data extraction (fast, free, reliable)
  const cheerioResult = extractWithCheerio(html, expectedCurrency);
  if (cheerioResult.price != null) {
    console.log(`[PriceExtract] ${url} -> ${cheerioResult.currency} ${cheerioResult.price} (cheerio)`);
    return cheerioResult;
  }

  // No price found
  console.log(`[PriceExtract] ${url} -> no price found`);
  return cheerioResult;
}

/**
 * Extract price from HTML using structured data (JSON-LD, meta tags, microdata).
 * No AI needed — works offline and is instant.
 */
function extractWithCheerio(html: string, expectedCurrency: string): ExtractedPrice {
  const $ = cheerio.load(html);
  let price: number | null = null;
  let currency = expectedCurrency;
  let name: string | null = null;
  let image_url: string | null = null;

  // Try JSON-LD first (most reliable)
  $('script[type="application/ld+json"]').each((_, el) => {
    if (price != null) return;
    try {
      const data = JSON.parse($(el).text());
      const products = Array.isArray(data) ? data : [data];

      for (const item of products) {
        const offer = findOffer(item);
        if (offer) {
          price = parsePrice(offer.price || offer.lowPrice);
          currency = (offer.priceCurrency as string) || currency;
          name = name || (item.name as string);
          image_url = image_url || extractImage(item);
          if (price != null) return;
        }
      }
    } catch {
      // skip malformed JSON-LD
    }
  });

  // Try meta tags
  if (price == null) {
    const metaPrice = $('meta[property="product:price:amount"]').attr("content")
      || $('meta[property="og:price:amount"]').attr("content");
    if (metaPrice) {
      price = parsePrice(metaPrice);
      currency = $('meta[property="product:price:currency"]').attr("content")
        || $('meta[property="og:price:currency"]').attr("content")
        || currency;
    }
  }

  // Try microdata (itemprop)
  if (price == null) {
    const itempropPrice = $('[itemprop="price"]').attr("content")
      || $('[itemprop="price"]').text();
    if (itempropPrice) {
      price = parsePrice(itempropPrice);
      currency = $('[itemprop="priceCurrency"]').attr("content") || currency;
    }
  }

  // Try data attributes
  if (price == null) {
    const dataPrice = $('[data-price]').first().attr("data-price");
    if (dataPrice) price = parsePrice(dataPrice);
  }

  // Try common CSS selectors as last resort
  if (price == null) {
    const selectors = [
      '.price-current', '.product-price', '.sale-price', '.current-price',
      '.price .now', '#priceblock_ourprice', '#priceblock_dealprice',
      '.a-price .a-offscreen', '[data-testid="price"]',
      '.price--large', '.price-sales',
    ];
    for (const sel of selectors) {
      const text = $(sel).first().text().trim();
      if (text) {
        const p = parsePrice(text);
        if (p != null) { price = p; break; }
      }
    }
  }

  // Get name from meta/title if not found
  if (!name) {
    name = $('meta[property="og:title"]').attr("content")
      || $('meta[name="twitter:title"]').attr("content")
      || $("title").text().trim()
      || null;
  }

  // Get image
  if (!image_url) {
    image_url = $('meta[property="og:image"]').attr("content")
      || $('meta[name="twitter:image"]').attr("content")
      || null;
  }

  return { price, currency, name, image_url };
}

function findOffer(item: Record<string, unknown>): Record<string, unknown> | null {
  if (!item || typeof item !== "object") return null;

  // Direct offer
  if (item["@type"] === "Offer" || item["@type"] === "AggregateOffer") {
    return item;
  }

  // Nested offers
  if (item.offers) {
    if (Array.isArray(item.offers)) {
      return item.offers[0] as Record<string, unknown>;
    }
    return item.offers as Record<string, unknown>;
  }

  // Check @graph
  if (Array.isArray(item["@graph"])) {
    for (const node of item["@graph"] as Record<string, unknown>[]) {
      const offer = findOffer(node);
      if (offer) return offer;
    }
  }

  return null;
}

function extractImage(item: Record<string, unknown>): string | null {
  if (typeof item.image === "string") return item.image;
  if (Array.isArray(item.image) && typeof item.image[0] === "string") return item.image[0];
  if (item.image && typeof item.image === "object" && "url" in item.image) {
    return (item.image as { url: string }).url;
  }
  return null;
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;

  // Strip currency symbols, commas, spaces
  const cleaned = value.replace(/[£$€¥,\s]/g, "").trim();
  const match = cleaned.match(/(\d+\.?\d*)/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  return isNaN(num) || num <= 0 ? null : num;
}

function trimHtml(html: string, maxLen: number): string {
  const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
  let head = "";
  if (headMatch) {
    const headHtml = headMatch[0];
    const metas = headHtml.match(/<meta[^>]*>/gi) || [];
    const title = headHtml.match(/<title[^>]*>[\s\S]*?<\/title>/i) || [];
    const jsonLd = headHtml.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
    head = [...metas, ...title, ...jsonLd].join("\n");
  }

  let body = html.replace(/<head[\s\S]*?<\/head>/i, "");
  body = body.replace(/<script[\s\S]*?<\/script>/gi, "");
  body = body.replace(/<style[\s\S]*?<\/style>/gi, "");
  body = body.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  body = body.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  body = body.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  body = body.replace(/<header[\s\S]*?<\/header>/gi, "");
  body = body.replace(/\s+/g, " ");

  return (head + "\n" + body).substring(0, maxLen);
}
