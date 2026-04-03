import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface ExtractedPrice {
  price: number | null;
  currency: string;
  name: string | null;
  image_url: string | null;
}

/**
 * Fetch a product page and use AI to extract the live price from the HTML.
 */
export async function extractPriceFromUrl(
  url: string,
  expectedProduct: string,
  expectedCurrency: string
): Promise<ExtractedPrice> {
  // Step 1: Fetch the page HTML
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

  // Step 2: Trim HTML to a reasonable size (keep head + main content)
  const trimmed = trimHtml(html, 15000);

  if (trimmed.length < 100) {
    console.log(`[PriceExtract] Page too short for ${url}`);
    return { price: null, currency: expectedCurrency, name: null, image_url: null };
  }

  // Step 3: Send to AI to extract price
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: "You extract product prices from HTML. Respond ONLY with a JSON object. No explanations.",
      messages: [
        {
          role: "user",
          content: `Extract the current selling price for "${expectedProduct}" from this product page HTML.

Return ONLY a JSON object:
{"price": 299.99, "currency": "${expectedCurrency}", "name": "exact product name from page", "image_url": "og:image or product image URL or null"}

Rules:
- price must be a number, not a string. Extract from the page's actual selling price.
- If there's a sale price and an original price, use the sale/current price
- If you find a price in a different currency, still return it but set the correct currency code
- If you cannot find a price, set price to null
- Look for: meta tags (product:price:amount), JSON-LD, itemprop="price", .price elements, data-price attributes

HTML:
${trimmed}`,
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`[PriceExtract] No JSON in AI response for ${url}`);
      return { price: null, currency: expectedCurrency, name: null, image_url: null };
    }

    const result = JSON.parse(jsonMatch[0]);
    console.log(`[PriceExtract] ${url} -> ${result.currency} ${result.price}`);

    return {
      price: typeof result.price === "number" ? result.price : null,
      currency: result.currency || expectedCurrency,
      name: result.name || null,
      image_url: result.image_url || null,
    };
  } catch (err) {
    console.error(`[PriceExtract] AI parse failed for ${url}:`, err);
    return { price: null, currency: expectedCurrency, name: null, image_url: null };
  }
}

/**
 * Trim HTML to keep the most price-relevant content within a character limit.
 * Keeps: <head> meta/title/script[type=ld+json], and strips scripts/styles from body.
 */
function trimHtml(html: string, maxLen: number): string {
  // Extract useful head content (meta tags, title, JSON-LD)
  const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
  let head = "";
  if (headMatch) {
    const headHtml = headMatch[0];
    // Keep meta tags
    const metas = headHtml.match(/<meta[^>]*>/gi) || [];
    // Keep title
    const title = headHtml.match(/<title[^>]*>[\s\S]*?<\/title>/i) || [];
    // Keep JSON-LD
    const jsonLd = headHtml.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
    head = [...metas, ...title, ...jsonLd].join("\n");
  }

  // Get body and strip scripts/styles/svg/nav/footer
  let body = html.replace(/<head[\s\S]*?<\/head>/i, "");
  body = body.replace(/<script[\s\S]*?<\/script>/gi, "");
  body = body.replace(/<style[\s\S]*?<\/style>/gi, "");
  body = body.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  body = body.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  body = body.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  body = body.replace(/<header[\s\S]*?<\/header>/gi, "");
  // Collapse whitespace
  body = body.replace(/\s+/g, " ");

  const combined = head + "\n" + body;
  return combined.substring(0, maxLen);
}
