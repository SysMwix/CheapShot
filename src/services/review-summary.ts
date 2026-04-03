import { queryOllama } from "@/lib/ai-provider";

export interface ReviewSummary {
  summary: string;
  pros: string[];
  cons: string[];
  rating: number | null;
  verdict: string;
}

/**
 * Generate a review summary using Ollama (local AI).
 * Uses the model's training knowledge about the product.
 * No web search — based on what the model knows.
 */
export async function getReviewSummary(productName: string): Promise<ReviewSummary> {
  try {
    const result = await queryOllama(
      "You summarise product reviews based on your knowledge. Respond with ONLY a JSON object.",
      `Based on your knowledge of "${productName}", provide a balanced review summary.

Return ONLY this JSON:
{
  "summary": "2-3 sentence overall summary of what reviewers typically think",
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["con 1", "con 2", "con 3"],
  "rating": 4.2,
  "verdict": "One sentence verdict — is it worth buying?"
}

Rules:
- rating is out of 5 (null if you don't know enough about this product)
- Be honest about cons
- Keep pros/cons to 3-5 items each
- If you don't know this product well, say so in the summary and set rating to null
- ONLY output the JSON`
    );

    if (!result) {
      return { summary: "Ollama unavailable — cannot generate review.", pros: [], cons: [], rating: null, verdict: "" };
    }

    const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return { summary: "Unable to parse review.", pros: [], cons: [], rating: null, verdict: "" };
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
    return { summary: "Unable to generate review at this time.", pros: [], cons: [], rating: null, verdict: "" };
  }
}
