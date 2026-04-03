import * as cheerio from "cheerio";

export interface ScrapeResult {
  name?: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
}

export interface PriceScraper {
  canHandle(url: string): boolean;
  scrape(url: string): Promise<ScrapeResult>;
}

/**
 * Generic scraper that attempts to extract price from common meta tags
 * and structured data. This is a stub — swap in site-specific scrapers
 * (Amazon, BestBuy, etc.) by implementing the PriceScraper interface.
 */
export class GenericScraper implements PriceScraper {
  canHandle(_url: string): boolean {
    return true; // fallback scraper handles any URL
  }

  async scrape(url: string): Promise<ScrapeResult> {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      const html = await res.text();
      return this.parse(html);
    } catch {
      return {};
    }
  }

  parse(html: string): ScrapeResult {
    const $ = cheerio.load(html);

    const name =
      $('meta[property="og:title"]').attr("content") || $("title").text();

    const priceStr =
      $('meta[property="product:price:amount"]').attr("content") ||
      $('[itemprop="price"]').attr("content") ||
      $('[data-price]').attr("data-price");

    const currency =
      $('meta[property="product:price:currency"]').attr("content") ||
      $('[itemprop="priceCurrency"]').attr("content") ||
      "USD";

    const imageUrl =
      $('meta[property="og:image"]').attr("content") || undefined;

    const price = priceStr ? parseFloat(priceStr) : undefined;

    return { name: name || undefined, price, currency, imageUrl };
  }
}

/**
 * Resolve the best scraper for a given URL.
 * Add site-specific scrapers to this array.
 */
const scrapers: PriceScraper[] = [new GenericScraper()];

export function getScraperForUrl(url: string): PriceScraper {
  return scrapers.find((s) => s.canHandle(url)) || new GenericScraper();
}
