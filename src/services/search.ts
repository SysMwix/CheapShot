export interface SearchResult {
  name: string;
  url: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
  source: string;
}

export interface SearchProvider {
  search(query: string): Promise<SearchResult[]>;
}

/**
 * Stub search provider. Replace with real implementations
 * (e.g., Google Shopping API, affiliate APIs, direct site search).
 */
export class StubSearchProvider implements SearchProvider {
  async search(query: string): Promise<SearchResult[]> {
    // TODO: Integrate with real search/API providers
    console.log(`[StubSearchProvider] Searching for: ${query}`);
    return [];
  }
}

const provider: SearchProvider = new StubSearchProvider();

export function getSearchProvider(): SearchProvider {
  return provider;
}
