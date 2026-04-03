import * as cheerio from "cheerio";
import { queryOllama } from "@/lib/ai-provider";

export interface VariantOption {
  type: string;
  options: string[];
}

export interface ExtractedPrice {
  price: number | null;
  currency: string;
  name: string | null;
  image_url: string | null;
  variant: string | null;
  available_variants?: VariantOption[];
}

/**
 * Fetch a product page and extract the live price.
 * Uses Cheerio first, falls back to Ollama (local AI) if needed.
 * No Claude API calls — fully local.
 */
export async function extractPriceFromUrl(
  url: string,
  expectedProduct: string,
  expectedCurrency: string,
  estimatedPrice?: number
): Promise<ExtractedPrice> {
  const html = await fetchPage(url);

  if (!html) {
    // Can't fetch page and no web search — just skip
    console.log(`[PriceExtract] ${url} -> page blocked, skipping`);
    return { price: null, currency: expectedCurrency, name: null, image_url: null, variant: null };
  }

  if (html.length < 100) {
    return { price: null, currency: expectedCurrency, name: null, image_url: null, variant: null };
  }

  const cheerioResult = extractWithCheerio(html, expectedCurrency);

  if (cheerioResult.price != null) {
    console.log(`[PriceExtract] ${url} -> ${cheerioResult.currency} ${cheerioResult.price} (cheerio)`);
    return cheerioResult;
  }

  // Cheerio found nothing — try Ollama
  console.log(`[PriceExtract] Cheerio failed for ${url}, trying Ollama...`);
  const aiResult = await extractWithOllama(html, expectedProduct, expectedCurrency);
  if (aiResult.price != null) {
    console.log(`[PriceExtract] ${url} -> ${aiResult.currency} ${aiResult.price} (ollama)`);
    return aiResult;
  }

  console.log(`[PriceExtract] ${url} -> no price found`);
  return cheerioResult;
}

function extractWithCheerio(html: string, expectedCurrency: string): ExtractedPrice {
  const $ = cheerio.load(html);
  let price: number | null = null;
  let currency = expectedCurrency;
  let name: string | null = null;
  let image_url: string | null = null;
  let variant: string | null = null;

  // Try JSON-LD first
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
    } catch { /* skip */ }
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

  // Try microdata
  if (price == null) {
    const itempropPrice = $('[itemprop="price"]').attr("content") || $('[itemprop="price"]').text();
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

  // Try common CSS selectors
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

  if (!name) {
    name = $('meta[property="og:title"]').attr("content")
      || $('meta[name="twitter:title"]').attr("content")
      || $("title").text().trim()
      || null;
  }

  if (!image_url) {
    image_url = $('meta[property="og:image"]').attr("content")
      || $('meta[name="twitter:image"]').attr("content")
      || null;
  }

  // Extract variant info
  $('script[type="application/ld+json"]').each((_, el) => {
    if (variant) return;
    try {
      const data = JSON.parse($(el).text());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.color || item.colour) { variant = String(item.color || item.colour); return; }
        if (item.size) { variant = variant ? `${variant} / ${item.size}` : String(item.size); }
        const props = item.additionalProperty || item.additionalProperties;
        if (Array.isArray(props)) {
          const parts: string[] = [];
          for (const p of props) {
            const pName = String(p.name || "").toLowerCase();
            if (pName.includes("colour") || pName.includes("color") || pName.includes("size")) parts.push(String(p.value));
          }
          if (parts.length > 0) variant = parts.join(" / ");
        }
      }
    } catch { /* skip */ }
  });

  if (!variant) {
    const variantSelectors = [
      'select[name*="colour"] option[selected]', 'select[name*="color"] option[selected]',
      'select[name*="size"] option[selected]', '.selected-colour', '.selected-color',
      '.colour-name', '.color-name', '.variant-name', '.product-variant',
      '.swatch--selected .swatch__label', '.swatch.active',
    ];
    for (const sel of variantSelectors) {
      const text = $(sel).first().text().trim() || $(sel).first().attr("data-selected-colour") || $(sel).first().attr("data-selected-color") || "";
      if (text && text.length < 60) { variant = text; break; }
    }
  }

  if (!variant && name) {
    const dashMatch = name.match(/[-\u2013]\s*(.+)$/);
    if (dashMatch) {
      const candidate = dashMatch[1].trim();
      if (candidate.length < 40 && !/\d{3,}/.test(candidate)) variant = candidate;
    }
  }

  // Extract available variants from dropdowns/swatches
  const available_variants: VariantOption[] = [];
  $('select').each((_, sel) => {
    const selectName = ($(sel).attr("name") || $(sel).attr("id") || "").toLowerCase();
    const label = $(sel).prev("label").text().toLowerCase() || selectName;
    let type: string | null = null;
    if (label.includes("colour") || label.includes("color")) type = "colour";
    else if (label.includes("size")) type = "size";
    if (type) {
      const options: string[] = [];
      $(sel).find("option").each((_, opt) => {
        const val = $(opt).text().trim();
        if (val && !val.toLowerCase().includes("select") && !val.toLowerCase().includes("choose")) options.push(val);
      });
      if (options.length > 0) available_variants.push({ type, options });
    }
  });

  const swatchSelectors = [
    { selector: '.colour-swatch, .color-swatch, [data-option-name="Colour"] li, [data-option-name="Color"] li', type: 'colour' },
    { selector: '.size-swatch, [data-option-name="Size"] li', type: 'size' },
  ];
  for (const { selector, type } of swatchSelectors) {
    const options: string[] = [];
    $(selector).each((_, el) => {
      const val = $(el).attr("title") || $(el).attr("data-value") || $(el).text().trim();
      if (val && val.length < 40) options.push(val);
    });
    if (options.length > 0 && !available_variants.some((v) => v.type === type)) available_variants.push({ type, options });
  }

  return { price, currency, name, image_url, variant, available_variants: available_variants.length > 0 ? available_variants : undefined };
}

function findOffer(item: Record<string, unknown>): Record<string, unknown> | null {
  if (!item || typeof item !== "object") return null;
  if (item["@type"] === "Offer" || item["@type"] === "AggregateOffer") return item;
  if (item.offers) {
    const offerList = Array.isArray(item.offers)
      ? (item.offers as Record<string, unknown>[])
      : [item.offers as Record<string, unknown>];
    if (offerList.length === 1) return offerList[0];
    const scored = offerList.map((o) => {
      const inStock = String(o.availability || "").toLowerCase().includes("instock");
      const price = parsePrice(o.price || o.lowPrice) ?? 0;
      return { offer: o, score: (inStock ? 1000 : 0) + price };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.offer || offerList[0];
  }
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
  if (item.image && typeof item.image === "object" && "url" in item.image) return (item.image as { url: string }).url;
  return null;
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u00A3$\u20AC\u00A5,\s]/g, "").trim();
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

async function fetchPage(url: string): Promise<string | null> {
  const headerSets: Record<string, string>[] = [
    {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      "Accept-Encoding": "identity",
      "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1", "Upgrade-Insecure-Requests": "1",
    },
    { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Accept": "text/html" },
  ];
  for (const headers of headerSets) {
    try {
      const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(15000) });
      if (res.ok) return await res.text();
      console.log(`[PriceExtract] HTTP ${res.status} for ${url}`);
    } catch (err) {
      console.log(`[PriceExtract] Fetch failed for ${url}:`, (err as Error).message);
    }
  }
  return null;
}

/**
 * Extract price from HTML using Ollama (local AI). No Claude.
 */
async function extractWithOllama(
  html: string,
  expectedProduct: string,
  expectedCurrency: string
): Promise<ExtractedPrice> {
  try {
    const trimmed = trimHtml(html, 8000);
    const result = await queryOllama(
      "You extract product prices from HTML. Respond ONLY with a JSON object.",
      `Extract the price and variant details for "${expectedProduct}" from this HTML.

Return ONLY: {"price": 299.99, "currency": "${expectedCurrency}", "name": "product name", "image_url": null, "variant": "colour/size or null"}
Use the sale/current price. If no price found, set price to null.

HTML:
${trimmed}`
    );

    if (!result) {
      console.log(`[PriceExtract] Ollama unavailable or failed`);
      return { price: null, currency: expectedCurrency, name: null, image_url: null, variant: null };
    }

    const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return { price: null, currency: expectedCurrency, name: null, image_url: null, variant: null };

    const parsed = JSON.parse(match[0]);
    return {
      price: typeof parsed.price === "number" ? parsed.price : null,
      currency: parsed.currency || expectedCurrency,
      name: parsed.name || null,
      image_url: parsed.image_url || null,
      variant: parsed.variant || null,
    };
  } catch (err) {
    console.log(`[PriceExtract] Ollama extraction failed:`, (err as Error).message?.substring(0, 80));
    return { price: null, currency: expectedCurrency, name: null, image_url: null, variant: null };
  }
}
