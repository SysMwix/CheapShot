import Anthropic from "@anthropic-ai/sdk";

export interface TrustCategory {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

export interface TrustFactor {
  factor: string;
  impact: "positive" | "negative" | "neutral";
  severity: number;
  detail: string;
}

export interface TrustResult {
  score: number;
  summary: string;
  categories: TrustCategory[];
  factors: TrustFactor[];
}

const client = new Anthropic();

export async function getTrustScore(retailer: string, url: string): Promise<TrustResult> {
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: "You evaluate online retailer trustworthiness. Respond ONLY with a JSON object.",
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [
        {
          role: "user",
          content: `Evaluate the trustworthiness of "${retailer}" (${url}).

Search for reviews and security information. Return ONLY this JSON:
{
  "score": 75,
  "summary": "1-2 sentence summary",
  "categories": [
    {"name": "Customer Reviews", "score": 80, "weight": 30, "detail": "Brief finding"},
    {"name": "Website Security", "score": 90, "weight": 20, "detail": "Brief finding"},
    {"name": "Payment Protection", "score": 70, "weight": 20, "detail": "Brief finding"},
    {"name": "Returns & Refunds", "score": 60, "weight": 15, "detail": "Brief finding"},
    {"name": "Company Reputation", "score": 75, "weight": 15, "detail": "Brief finding"}
  ],
  "factors": [
    {"factor": "Finding description", "impact": "positive", "severity": 8, "detail": "Why it matters"},
    {"factor": "Concern description", "impact": "negative", "severity": 6, "detail": "Why it matters"}
  ]
}

Rules: category scores 0-100, weights sum to 100, 4-8 factors sorted by severity (1-10), be honest.`,
        },
      ],
    });

    const allText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const cleaned = allText.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback();

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      score: Math.max(0, Math.min(100, parsed.score || 50)),
      summary: parsed.summary || "No details available",
      categories: (parsed.categories || []).map((c: TrustCategory) => ({
        name: c.name,
        score: Math.max(0, Math.min(100, c.score || 50)),
        weight: c.weight || 20,
        detail: c.detail || "",
      })),
      factors: (parsed.factors || []).map((f: TrustFactor) => ({
        factor: f.factor,
        impact: f.impact || "neutral",
        severity: Math.max(1, Math.min(10, f.severity || 5)),
        detail: f.detail || "",
      })),
    };
  } catch (err) {
    console.error("[Trust Score] Failed:", err);
    return fallback();
  }
}

function fallback(): TrustResult {
  return { score: 50, summary: "Could not evaluate", categories: [], factors: [] };
}
