/**
 * SearXNG client — self-hosted web search.
 * Queries a local SearXNG instance and returns structured results.
 */

const SEARXNG_URL = process.env.SEARXNG_URL || "http://localhost:8080";

export interface SearchResult {
  title: string;
  url: string;
  content: string; // snippet
}

/**
 * Search the web via SearXNG.
 * Returns up to `maxResults` results.
 */
export async function webSearch(query: string, maxResults = 30): Promise<SearchResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      categories: "general",
      language: "en-GB",
    });

    const res = await fetch(`${SEARXNG_URL}/search?${params}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.log(`[SearXNG] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results: SearchResult[] = (data.results || [])
      .slice(0, maxResults)
      .map((r: { title?: string; url?: string; content?: string }) => ({
        title: r.title || "",
        url: r.url || "",
        content: r.content || "",
      }))
      .filter((r: SearchResult) => r.url && r.url.startsWith("http"));

    console.log(`[SearXNG] "${query}" -> ${results.length} results`);
    return results;
  } catch (err) {
    console.error(`[SearXNG] Search failed:`, (err as Error).message);
    return [];
  }
}

/**
 * Check if SearXNG is available.
 */
export async function isSearXNGAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${SEARXNG_URL}/`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
