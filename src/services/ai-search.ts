import Anthropic from "@anthropic-ai/sdk";

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

/**
 * Use AI + web search to find retailer URLs where a product is sold.
 * Prices returned here are approximate hints from search snippets —
 * the caller should verify them by fetching the actual page.
 */
export async function searchProducts(
  query: string,
  country?: string,
  currency?: string,
  excludeRetailers?: string[]
): Promise<ProductOffer[]> {
  const region = country || "United Kingdom";
  const curr = currency || "GBP";

  const allExcluded = [...ALWAYS_EXCLUDE, ...(excludeRetailers || [])];
  const exclusionNote = `\nExclude these sites (they are aggregators, not shops): ${allExcluded.join(", ")}.`;

  const systemPrompt = `You are a shopping assistant that finds product URLs on real retailer websites. You MUST respond with ONLY a valid JSON array. No explanations, no prose, no markdown. Just the JSON array.`;

  const userPrompt = `Find online shops in ${region} that sell "${query}".${exclusionNote}

Search for this product and return a JSON array of direct product page URLs from real retailers. Each entry:
[{"name":"product name from listing","price":99.99,"currency":"${curr}","url":"https://www.store.com/exact-product-page","retailer":"Store Name","image_url":null}]

Important:
- The URL must be a DIRECT link to the specific product page, not a search results page
- Include 3-5 results from different actual retailers (not comparison sites)
- price is an approximate hint from the search snippet — it's OK if not exact
- Respond with ONLY the JSON array`;

  let offers = await doSearch(systemPrompt, userPrompt);

  if (offers.length === 0) {
    console.log("[AI Search] No results on first attempt, retrying...");
    const retryPrompt = `Search more broadly for "${query}" for sale in ${region}. Try major retailers like Amazon, eBay, official brand stores, or specialist shops.${exclusionNote}

Return a JSON array of direct product page URLs:
[{"name":"product name","price":99.99,"currency":"${curr}","url":"https://...","retailer":"Store Name","image_url":null}]

ONLY output the JSON array.`;

    offers = await doSearch(systemPrompt, retryPrompt);
  }

  return offers;
}

async function doSearch(systemPrompt: string, userPrompt: string): Promise<ProductOffer[]> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ],
    messages: [
      { role: "user", content: userPrompt },
    ],
  });

  console.log(
    "[AI Search] Response blocks:",
    response.content.map((b) => b.type)
  );

  const allText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  console.log("[AI Search] Combined text:", allText.substring(0, 800));

  if (!allText.trim()) return [];

  try {
    const cleaned = allText.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) {
      if (cleaned.includes("[]")) return [];
      console.log("[AI Search] No JSON array found");
      return [];
    }

    const offers: ProductOffer[] = JSON.parse(jsonMatch[0]);
    const valid = offers.filter(
      (o) => o.name && o.url && o.retailer && o.url.startsWith("http")
    );
    console.log(`[AI Search] Found ${valid.length} valid offers`);
    return valid;
  } catch (err) {
    console.error("[AI Search] Failed to parse:", err);
    return [];
  }
}
