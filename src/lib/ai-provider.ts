/**
 * AI Provider — Ollama (local inference).
 * All AI tasks route through here.
 */

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";
const OLLAMA_ENABLED = process.env.OLLAMA_ENABLED !== "false";

interface OllamaResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

let ollamaHealthy: boolean | null = null;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 60000;

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
 * Query Ollama and get a text response.
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
          temperature: 0.1,
          num_predict: 1024,
        },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      console.log(`[Ollama] HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as OllamaResponse;
    return data.message?.content || null;
  } catch (err) {
    console.log(`[Ollama] Failed:`, (err as Error).message?.substring(0, 80));
    ollamaHealthy = false;
    lastHealthCheck = Date.now();
    return null;
  }
}

/**
 * Query Ollama with forced JSON output.
 * Uses Ollama's native JSON mode — guarantees valid JSON response.
 */
export async function queryOllamaJson(
  systemPrompt: string,
  userPrompt: string
): Promise<Record<string, unknown> | Record<string, unknown>[] | null> {
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
        format: "json",
        options: {
          temperature: 0.1,
          num_predict: 2048,
        },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      console.log(`[Ollama] HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as OllamaResponse;
    const content = data.message?.content;
    if (!content) return null;

    return JSON.parse(content);
  } catch (err) {
    console.log(`[Ollama JSON] Failed:`, (err as Error).message?.substring(0, 80));
    ollamaHealthy = false;
    lastHealthCheck = Date.now();
    return null;
  }
}

export async function getActiveProvider(): Promise<"ollama" | "none"> {
  return (await isOllamaAvailable()) ? "ollama" : "none";
}

export { OLLAMA_URL, OLLAMA_MODEL, OLLAMA_ENABLED };
