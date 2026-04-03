import * as cheerio from "cheerio";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const ALWAYS_EXCLUDE_DOMAINS = [
  "idealo.", "pricerunner.", "kelkoo.", "pricespy.", "google.",
  "youtube.", "facebook.", "twitter.", "instagram.", "reddit.",
  "wikipedia.", "pinterest.",
];

/**
 * Search DuckDuckGo for product listings. No API key needed.
 */
export async function searchWeb(query: string, region: string): Promise<SearchResult[]> {
  const searchQuery = `${query} buy ${region}`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.log(`[WebSearch] HTTP ${res.status}`);
      return [];
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $(".result").each((_, el) => {
      const titleEl = $(el).find(".result__title a");
      const snippetEl = $(el).find(".result__snippet");

      const title = titleEl.text().trim();
      let href = titleEl.attr("href") || "";

      // DDG wraps URLs — extract the actual URL
      if (href.includes("uddg=")) {
        const match = href.match(/uddg=([^&]+)/);
        if (match) href = decodeURIComponent(match[1]);
      }

      const snippet = snippetEl.text().trim();

      if (title && href && href.startsWith("http")) {
        // Filter out aggregators and non-shop sites
        const isExcluded = ALWAYS_EXCLUDE_DOMAINS.some((d) => href.includes(d));
        if (!isExcluded) {
          results.push({ title, url: href, snippet });
        }
      }
    });

    console.log(`[WebSearch] Found ${results.length} results for "${searchQuery}"`);
    return results.slice(0, 10);
  } catch (err) {
    console.error("[WebSearch] Failed:", (err as Error).message);
    return [];
  }
}

/**
 * Extract retailer name from a URL.
 */
export function retailerFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // Try to make a nice name: "sportsbikeshop.co.uk" -> "Sportsbikeshop"
    const parts = hostname.split(".");
    const name = parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return url;
  }
}
