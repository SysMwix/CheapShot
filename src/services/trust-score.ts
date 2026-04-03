import Anthropic from "@anthropic-ai/sdk";

export interface TrustResult {
  score: number; // 0-100
  summary: string;
}

const client = new Anthropic();

export async function getTrustScore(retailer: string, url: string): Promise<TrustResult> {
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
        },
      ],
      messages: [
        {
          role: "user",
          content: `Evaluate the trustworthiness of the online retailer "${retailer}" (${url}).

Search for customer reviews, complaints, and information about this retailer. Consider:
1. Customer reviews and ratings (Trustpilot, Google reviews, etc.)
2. Website legitimacy and age
3. Payment security (SSL, known payment processors)
4. Return/refund policy reputation
5. Any scam reports or warnings

Respond with ONLY a JSON object (no other text, no markdown):
{
  "score": 75,
  "summary": "Brief 1-2 sentence summary of findings"
}

score must be 0-100 where:
- 90-100: Highly trusted major retailer
- 70-89: Well-known, generally trusted
- 50-69: Mixed reviews, use caution
- 30-49: Concerning reports, risky
- 0-29: Avoid, likely scam or very poor reputation`,
        },
      ],
    });

    const allText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const cleaned = allText.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { score: 50, summary: "Could not evaluate" };

    const result = JSON.parse(jsonMatch[0]);
    return {
      score: Math.max(0, Math.min(100, result.score || 50)),
      summary: result.summary || "No details available",
    };
  } catch (err) {
    console.error("[Trust Score] Failed:", err);
    return { score: 50, summary: "Could not evaluate" };
  }
}
