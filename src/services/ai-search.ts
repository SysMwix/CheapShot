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

export async function searchProducts(query: string): Promise<ProductOffer[]> {
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

Search the web to find where I can buy this product right now. Look for current prices from online retailers.

After searching, respond with ONLY a JSON array (no other text, no markdown fences) of offers you found. Each offer object must have these exact fields:
{
  "name": "full product name",
  "price": 123.99,
  "currency": "USD",
  "url": "https://direct-link-to-product-page",
  "retailer": "Store Name",
  "image_url": "https://image-url-or-null"
}

Rules:
- price must be a number, not a string
- Only include offers where you found a real price
- Find up to 5 offers from different stores
- If you can't find any offers, return an empty array: []`,
      },
    ],
  });

  // Log all content blocks for debugging
  console.log(
    "[AI Search] Response blocks:",
    response.content.map((b) => b.type)
  );

  // Collect ALL text blocks (there may be multiple)
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
    // Try to extract JSON array — handle markdown code fences too
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
