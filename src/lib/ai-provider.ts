/**
 * AI Provider abstraction.
 * Routes requests to either a local Ollama instance or Claude API.
 *
 * - Ollama: Used for price extraction from HTML (no web search needed)
 * - Claude: Used for web search tasks (AI search, trust scoring, reviews)
 *
 * If Ollama is unavailable, falls back to Claude automatically.
 */

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";
const OLLAMA_ENABLED = process.env.OLLAMA_ENABLED !== "false"; // enabled by default if URL is set

interface OllamaResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

/**
 * Check if Ollama is reachable.
 * Caches the result for 60 seconds to avoid hammering the health endpoint.
 */
let ollamaHealthy: boolean | null = null;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute

async function isOllamaAvailable(): Promise<boolean> {
  if (!OLLAMA_ENABLED) return false;

  const now = Date.now();
  if (ollamaHealthy !== null && now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
    return ollamaHealthy;
  }

  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    ollamaHealthy = res.ok;
  } catch {
    ollamaHealthy = false;
  }
  lastHealthCheck = now;
  return ollamaHealthy;
}

/**
 * Send a prompt to Ollama and get a text response.
 * Used for simple extraction tasks (price from HTML, variant extraction).
 */
export async function queryOllama(
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  if (!(await isOllamaAvailable())) return null;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        options: {
          temperature: 0.1,  // Low temp for structured extraction
          num_predict: 512,   // Keep responses short
        },
      }),
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    if (!res.ok) {
      console.log(`[Ollama] HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as OllamaResponse;
    return data.message?.content || null;
  } catch (err) {
    console.log(`[Ollama] Failed:`, (err as Error).message?.substring(0, 80));
    // Mark as unhealthy so we don't keep trying
    ollamaHealthy = false;
    lastHealthCheck = Date.now();
    return null;
  }
}

/**
 * Check which provider is active.
 * Useful for logging and monitoring.
 */
export async function getActiveProvider(): Promise<"ollama" | "claude"> {
  return (await isOllamaAvailable()) ? "ollama" : "claude";
}

export { OLLAMA_URL, OLLAMA_MODEL, OLLAMA_ENABLED };
