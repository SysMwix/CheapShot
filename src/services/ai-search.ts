import Anthropic from "@anthropic-ai/sdk";
import { extractPriceFromUrl } from "./price-extractor";

export interface ProductOffer {
  name: string;
  price: number;
  currency: string;
  url: string;
  retailer: string;
  image_url?: string;
}

const client = new Anthropic();

const ALWAYS_EXCLUDE = ["Idealo", "PriceRunner", "Google Shopping", "Kelkoo", "PriceSpy"];

export async function searchProducts(
  query: string,
  country?: string,
  currency?: string,
  excludeRetailers?: string[]
): Promise<ProductOffer[]> {
  const region = country || "United Kingdom";
  const curr = currency || "GBP";

  const allExcluded = [...ALWAYS_EXCLUDE, ...(excludeRetailers || [])];
  const exclusionNote = `\nExclude these sites: ${allExcluded.join(", ")}.`;

  const systemPrompt = `You are a shopping assistant that finds product URLs on real retailer websites. Respond with ONLY a valid JSON array. No explanations.`;

  const userPrompt = `Find online shops in ${region} that sell "${query}".${exclusionNote}

Return a JSON array of direct product page URLs from real retailers:
[{"name":"product name","price":99.99,"currency":"${curr}","url":"https://www.store.com/product-page","retailer":"Store Name","image_url":null}]

Rules:
- URL must be a DIRECT product page link, not search results
- 3-5 results from different actual retailers
- price is approximate from search — OK if not exact
- ONLY output the JSON array`;

  // Step 1: Find retailer URLs via Claude + web search
  let offers = await doSearch(systemPrompt, userPrompt);

  if (offers.length === 0) {
    const retryPrompt = `Search more broadly for "${query}" for sale in ${region}. Try Amazon, eBay, official brand stores, specialist shops.${exclusionNote}

Return a JSON array:
[{"name":"product name","price":99.99,"currency":"${curr}","url":"https://...","retailer":"Store Name","image_url":null}]

ONLY output the JSON array.`;
    offers = await doSearch(systemPrompt, retryPrompt);
  }

  // Step 2: Verify prices by fetching live pages with Cheerio
  if (offers.length > 0) {
    console.log(`[Search] Verifying ${offers.length} prices from live pages...`);
    const verified = await Promise.all(
      offers.map(async (offer) => {
        const extracted = await extractPriceFromUrl(offer.url, query, curr);
        return {
          ...offer,
          price: extracted.price ?? offer.price ?? 0,
          currency: extracted.currency || offer.currency || curr,
          name: extracted.name || offer.name,
          image_url: extracted.image_url || offer.image_url || undefined,
        };
      })
    );
    return verified.filter((o) => o.price > 0);
  }

  return offers;
}

async function doSearch(systemPrompt: string, userPrompt: string): Promise<ProductOffer[]> {
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
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

    const cleaned = allText.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) return [];

    const offers: ProductOffer[] = JSON.parse(jsonMatch[0]);
    return offers.filter((o) => o.name && o.url && o.retailer && o.url.startsWith("http"));
  } catch (err) {
    console.error("[AI Search] Failed:", err);
    return [];
  }
}
