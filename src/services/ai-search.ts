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

export async function searchProducts(
  query: string,
  country?: string,
  currency?: string,
  excludeRetailers?: string[]
): Promise<ProductOffer[]> {
  const region = country || "United States";
  const curr = currency || "USD";

  const exclusionNote =
    excludeRetailers && excludeRetailers.length > 0
      ? `\n\nDO NOT include results from these retailers: ${excludeRetailers.join(", ")}. Find alternatives from other stores instead.`
      : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ],
    messages: [
      {
        role: "user",
        content: `I want to buy: "${query}"

I'm shopping from ${region}. Search for this product on retailers that ship to ${region} and show prices in ${curr}.

Search the web to find where I can buy this product right now. Prioritize local/regional retailers for ${region}.${exclusionNote}

After searching, respond with ONLY a JSON array (no other text, no markdown fences) of offers you found. Each offer object must have these exact fields:
{
  "name": "full product name",
  "price": 123.99,
  "currency": "${curr}",
  "url": "https://direct-link-to-product-page",
  "retailer": "Store Name",
  "image_url": "https://image-url-or-null"
}

Rules:
- price must be a number in ${curr}, not a string
- Only include offers where you found a real price
- Find up to 5 offers from different stores available in ${region}
- If you can't find any offers, return an empty array: []`,
      },
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

  console.log("[AI Search] Combined text:", allText.substring(0, 500));

  if (!allText.trim()) {
    console.log("[AI Search] No text content in response");
    return [];
  }

  try {
    const cleaned = allText.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log("[AI Search] No JSON array found in response");
      return [];
    }

    const offers: ProductOffer[] = JSON.parse(jsonMatch[0]);
    const valid = offers.filter(
      (o) => o.name && typeof o.price === "number" && o.url && o.retailer
    );
    console.log(`[AI Search] Found ${valid.length} valid offers`);
    return valid;
  } catch (err) {
    console.error("[AI Search] Failed to parse:", err);
    console.error("[AI Search] Raw text:", allText);
    return [];
  }
}
