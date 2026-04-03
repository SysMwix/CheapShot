import Anthropic from "@anthropic-ai/sdk";
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

const client = new Anthropic();

const ALWAYS_EXCLUDE = ["Idealo", "PriceRunner", "Google Shopping", "Kelkoo", "PriceSpy"];

export interface SizePrefs {
  [key: string]: string | undefined;
}

export async function searchProducts(
  query: string,
  country?: string,
  currency?: string,
  excludeRetailers?: string[],
  sizePrefs?: SizePrefs,
  searchHint?: string
): Promise<ProductOffer[]> {
  const region = country || "United Kingdom";
  const curr = currency || "GBP";

  const allExcluded = [...ALWAYS_EXCLUDE, ...(excludeRetailers || [])];
  const exclusionNote = `\nExclude these sites: ${allExcluded.join(", ")}.`;

  // Build size hints from user preferences
  const sizeHints: string[] = [];
  if (sizePrefs) {
    for (const [key, val] of Object.entries(sizePrefs)) {
      if (val) {
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
        sizeHints.push(`${label}: ${val}`);
      }
    }
  }
  const sizeNote = sizeHints.length > 0
    ? `\nThe user's preferred sizes are: ${sizeHints.join(", ")}. If this product comes in sizes, prioritise finding results in these sizes.`
    : "";
  const retailerHint = searchHint
    ? `\nFocus on ${searchHint}.`
    : "";

  const systemPrompt = `You are a bargain-hunting shopping assistant. Your goal is to find the CHEAPEST possible prices for a SPECIFIC product across all retailers. The price you return must be the ACTUAL selling price shown on the product page, not a deposit or accessory price. Respond with ONLY a valid JSON array. No explanations.`;

  const userPrompt = `Find the CHEAPEST prices for "${query}" available in ${region}.${exclusionNote}${sizeNote}${retailerHint}

Return a JSON array of direct product page URLs from real retailers:
[{"name":"exact product name from listing","price":99.99,"currency":"${curr}","url":"https://www.store.com/product-page","retailer":"Store Name","image_url":null,"variant":"colour or size if applicable, e.g. Matt Black, Pearl White, Size L"}]

Rules:
- URL must be a DIRECT product page link to this EXACT product, not search results, category pages, or similar products
- The "price" must be the FULL selling price shown on the page — NOT a deposit, monthly payment, or accessory price
- Find 5-10 results, prioritising the LOWEST prices first
- Include different colour/size variants if they have different prices — a cheaper colour is a valid find
- Search specialist retailers, clearance sites, and lesser-known shops — not just big names
- Check for sale prices, clearance deals, and discontinued colour variants
- The "variant" field should describe the specific colour, size, or option if the listing is for a specific one (null if generic/default)
- Double-check each URL actually leads to the correct product before including it
- ONLY output the JSON array`;

  // Step 1: Find retailer URLs via Claude + web search
  let offers = await doSearch(systemPrompt, userPrompt);

  if (offers.length === 0) {
    const retryPrompt = `Search more broadly for the CHEAPEST "${query}" for sale in ${region}. Try Amazon, eBay, official brand stores, specialist motorcycle/sports shops, clearance outlets. Include different colour variants if they have lower prices.${exclusionNote}

Return a JSON array:
[{"name":"product name","price":99.99,"currency":"${curr}","url":"https://...","retailer":"Store Name","image_url":null,"variant":"colour/size or null"}]

ONLY output the JSON array.`;
    offers = await doSearch(systemPrompt, retryPrompt);
  }

  // Step 2: Verify prices by fetching live pages with Cheerio
  if (offers.length > 0) {
    console.log(`[Search] Verifying ${offers.length} prices from live pages...`);
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
    // Sort by price ascending so cheapest are first
    return verified.filter((o) => o.price > 0).sort((a, b) => a.price - b.price);
  }

  return offers;
}

async function doSearch(systemPrompt: string, userPrompt: string): Promise<ProductOffer[]> {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: userPrompt }],
    });

    const allText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    console.log("[AI Search] Response:", allText.substring(0, 500));

    if (!allText.trim()) return [];

    const cleaned = allText.replace(/<cite[^>]*>.*?<\/cite>/g, "").replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) return [];

    const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>[];
    const offers: ProductOffer[] = raw.map((o) => ({
      name: String(o.name || ""),
      price: Number(o.price) || 0,
      currency: String(o.currency || ""),
      url: String(o.url || ""),
      retailer: String(o.retailer || ""),
      image_url: o.image_url ? String(o.image_url) : undefined,
      variant: o.variant ? String(o.variant) : undefined,
    }));
    return offers.filter((o) => o.name && o.url && o.retailer && o.url.startsWith("http"));
  } catch (err) {
    console.error("[AI Search] Failed:", err);
    return [];
  }
}
