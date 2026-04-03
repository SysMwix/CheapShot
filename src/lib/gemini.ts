import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export function getModel(modelName = "gemini-2.0-flash") {
  return genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
  });
}

export function getSearchModel() {
  return genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
    tools: [{ googleSearchRetrieval: {} }],
  });
}

/**
 * Extract text from Gemini response, handling grounding/search results.
 */
export function extractText(response: { response: { text: () => string } }): string {
  try {
    return response.response.text();
  } catch {
    return "";
  }
}

/**
 * Call Gemini with automatic retry on 429 rate limit errors.
 */
export async function generateWithRetry(
  model: ReturnType<typeof getModel>,
  prompt: string,
  maxRetries = 2
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return extractText(result);
    } catch (err) {
      const isRateLimit = (err as { status?: number }).status === 429;
      if (isRateLimit && attempt < maxRetries) {
        const delay = (attempt + 1) * 15000; // 15s, 30s
        console.log(`[Gemini] Rate limited, retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  return "";
}

/**
 * Parse a JSON array or object from AI text output.
 */
export function parseJsonFromText<T>(text: string, type: "array" | "object" = "array"): T | null {
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const pattern = type === "array" ? /\[\s*\{[\s\S]*\}\s*\]/ : /\{[\s\S]*\}/;
  const match = cleaned.match(pattern);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
