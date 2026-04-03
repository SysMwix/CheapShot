import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface ReviewSummary {
  summary: string;
  pros: string[];
  cons: string[];
  rating: number | null; // 1-5
  verdict: string;
}

/**
 * Use Claude with web search to generate a review summary for a product.
 */
export async function getReviewSummary(productName: string): Promise<ReviewSummary> {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: "You summarise product reviews from across the web. Respond with ONLY a JSON object.",
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      messages: [{
        role: "user",
        content: `Search for reviews of "${productName}" and provide a balanced summary.

Return ONLY this JSON:
{
  "summary": "2-3 sentence overall summary of what reviewers think",
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["con 1", "con 2", "con 3"],
  "rating": 4.2,
  "verdict": "One sentence verdict — is it worth buying?"
}

Rules:
- Base this on REAL reviews from multiple sources
- rating is the average rating out of 5 (null if not enough data)
- Be honest about cons — don't sugarcoat
- Keep pros/cons to 3-5 items each
- ONLY output the JSON`,
      }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text).join("");

    const cleaned = text.replace(/<cite[^>]*>.*?<\/cite>/g, "").replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return { summary: "Unable to find reviews.", pros: [], cons: [], rating: null, verdict: "" };
    }

    const parsed = JSON.parse(match[0]);
    return {
      summary: String(parsed.summary || ""),
      pros: Array.isArray(parsed.pros) ? parsed.pros.map(String) : [],
      cons: Array.isArray(parsed.cons) ? parsed.cons.map(String) : [],
      rating: typeof parsed.rating === "number" ? parsed.rating : null,
      verdict: String(parsed.verdict || ""),
    };
  } catch (err) {
    console.error("[ReviewSummary] Failed:", err);
    return { summary: "Unable to fetch reviews at this time.", pros: [], cons: [], rating: null, verdict: "" };
  }
}
