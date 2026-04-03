"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRegion } from "@/components/RegionContext";
import PriceChart from "@/components/PriceChart";
import FrequencySelector from "@/components/FrequencySelector";
import type { CheckFrequency } from "@/lib/db";

interface VariantOption {
  type: string;
  options: string[];
}

interface Source {
  id: number;
  retailer: string;
  url: string;
  image_url: string | null;
  current_price: number | null;
  previous_price: number | null;
  currency: string;
  trust_score: number | null;
  trust_summary: string | null;
  variant_name: string | null;
  available_variants_json: string | null;
  last_checked_at: string | null;
}

interface ProductDetail {
  id: number;
  name: string;
  desired_price: number | null;
  currency: string;
  check_frequency: CheckFrequency;
  check_day: number | null;
  search_status: string;
  sources: Source[];
  best_price: number | null;
}

interface HistoryEntry {
  source_id: number;
  retailer: string;
  price: number;
  checked_at: string;
}

interface ReviewSummary {
  summary: string;
  pros: string[];
  cons: string[];
  rating: number | null;
  verdict: string;
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { region, minTrust } = useRegion();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [variantFilters, setVariantFilters] = useState<Record<string, string>>({});
  const [manualUrl, setManualUrl] = useState("");
  const [addingManual, setAddingManual] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [pRes, hRes] = await Promise.all([
        fetch(`/api/products/${id}`),
        fetch(`/api/products/${id}/history`),
      ]);
      if (pRes.ok) setProduct(await pRes.json());
      if (hRes.ok) setHistory(await hRes.json());
    } catch (err) {
      console.error("Failed to fetch:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
    fetchReview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch(`/api/products/${id}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: region.name, currency: region.currency }),
      });
    } catch (err) {
      console.error("Refresh failed:", err);
    }
    await fetchData();
    setRefreshing(false);
  }

  async function handleFrequencyChange(freq: CheckFrequency, day: number | null) {
    await fetch(`/api/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check_frequency: freq, check_day: day }),
    });
    await fetchData();
  }

  async function handleRemoveSource(sourceId: number) {
    await fetch(`/api/products/${id}/sources/${sourceId}`, { method: "DELETE" });
    await fetchData();
  }

  async function handleClearPrices() {
    if (!product) return;
    for (const source of product.sources) {
      await fetch(`/api/products/${id}/sources/${source.id}`, { method: "DELETE" });
    }
    // Reset excluded retailers
    await fetch(`/api/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excluded_retailers: "[]" }),
    });
    setReview(null);
    await fetchData();

    setRefreshing(true);
    try {
      await fetch(`/api/products/${id}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: region.name, currency: region.currency }),
      });
    } catch (err) {
      console.error("Re-search failed:", err);
    }
    await fetchData();
    setRefreshing(false);
  }

  async function handleAddManualUrl(e: React.FormEvent) {
    e.preventDefault();
    const url = manualUrl.trim();
    if (!url || !url.startsWith("http")) return;

    setAddingManual(true);
    try {
      await fetch(`/api/products/${id}/sources/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, currency: product?.currency || "GBP" }),
      });
      setManualUrl("");
      await fetchData();
    } catch (err) {
      console.error("Manual add failed:", err);
    }
    setAddingManual(false);
  }

  async function fetchReview() {
    if (review || reviewLoading) return;
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/products/${id}/reviews`);
      if (res.ok) setReview(await res.json());
    } catch (err) {
      console.error("Review fetch failed:", err);
    }
    setReviewLoading(false);
  }

  function getMergedVariants(): VariantOption[] {
    if (!product) return [];
    const variantMap = new Map<string, Set<string>>();
    for (const source of product.sources) {
      if (!source.available_variants_json) continue;
      try {
        const variants: VariantOption[] = JSON.parse(source.available_variants_json);
        for (const v of variants) {
          const key = v.type.toLowerCase();
          if (!variantMap.has(key)) variantMap.set(key, new Set());
          for (const opt of v.options) variantMap.get(key)!.add(opt);
        }
      } catch { /* skip */ }
    }
    return Array.from(variantMap.entries()).map(([type, options]) => ({
      type,
      options: Array.from(options),
    }));
  }

  function getFilteredSources() {
    if (!product) return [];

    const trustThreshold = minTrust;
    let sources = product.sources.filter(
      (s) => s.trust_score == null || s.trust_score >= trustThreshold
    );

    const activeFilters = Object.entries(variantFilters).filter(([, v]) => v);
    if (activeFilters.length === 0) return sources;

    return sources.filter((source) => {
      const name = (source.variant_name || "").toLowerCase();
      for (const [, filterVal] of activeFilters) {
        if (name.includes(filterVal.toLowerCase())) return true;
      }
      if (source.available_variants_json) {
        try {
          const variants: VariantOption[] = JSON.parse(source.available_variants_json);
          for (const [filterType, filterVal] of activeFilters) {
            const match = variants.find((v) => v.type.toLowerCase() === filterType);
            if (match && match.options.some((o) => o.toLowerCase() === filterVal.toLowerCase())) return true;
          }
        } catch { /* skip */ }
      }
      return false;
    });
  }

  const mergedVariants = getMergedVariants();
  const filteredSources = getFilteredSources();

  if (loading) {
    return <div className="text-center text-gray-400 py-20">Loading...</div>;
  }

  if (!product) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 mb-2">Product not found</p>
        <Link href="/" className="text-emerald-600 hover:underline text-sm">Back to dashboard</Link>
      </div>
    );
  }

  const isAlert = product.best_price != null && product.desired_price != null && product.best_price <= product.desired_price;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 transition">
        &larr; Back to dashboard
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            {product.best_price != null && (
              <span className={`text-xl font-bold ${isAlert ? "text-emerald-600" : ""}`}>
                {product.currency} {product.best_price.toFixed(2)}
              </span>
            )}
            {product.desired_price != null && (
              <span className="text-sm text-gray-500">
                Target: {product.currency} {product.desired_price.toFixed(2)}
              </span>
            )}
            {isAlert && (
              <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">
                Below target!
              </span>
            )}
          </div>
        </div>
        <FrequencySelector
          frequency={product.check_frequency}
          checkDay={product.check_day}
          onChange={handleFrequencyChange}
          compact
        />
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          {refreshing ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Searching...
            </span>
          ) : (
            "Refresh Prices"
          )}
        </button>
        <button
          onClick={handleClearPrices}
          disabled={refreshing}
          className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          Clear &amp; Re-search
        </button>
      </div>

      {/* Manual URL add */}
      <form onSubmit={handleAddManualUrl} className="flex gap-2">
        <input
          type="url"
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          placeholder="Paste a product URL to add manually..."
          className="flex-1 border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={addingManual}
        />
        <button
          type="submit"
          disabled={addingManual || !manualUrl.trim()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          {addingManual ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Adding...
            </span>
          ) : (
            "+ Add URL"
          )}
        </button>
      </form>

      {/* Price chart */}
      <div className="bg-white border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Price History</h2>
        <PriceChart history={history} currency={product.currency} desiredPrice={product.desired_price} />
      </div>

      {/* Variant filters */}
      {mergedVariants.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Filter by Options</h2>
          <div className="flex flex-wrap gap-3">
            {mergedVariants.map((v) => (
              <div key={v.type} className="flex items-center gap-2">
                <label className="text-sm text-gray-600 capitalize">{v.type}:</label>
                <select
                  value={variantFilters[v.type] || ""}
                  onChange={(e) => setVariantFilters((prev) => ({ ...prev, [v.type]: e.target.value }))}
                  className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">All</option>
                  {v.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            ))}
            {Object.values(variantFilters).some(Boolean) && (
              <button
                onClick={() => setVariantFilters({})}
                className="text-xs text-gray-500 hover:text-red-500 transition"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Source table */}
      <div className="bg-white border rounded-lg">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-gray-700">
            Tracked Sources ({filteredSources.length}{filteredSources.length !== product.sources.length ? ` of ${product.sources.length}` : ""}/10)
          </h2>
        </div>
        <div className="overflow-x-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-2">Retailer</th>
                <th className="px-4 py-2">Variant</th>
                <th className="px-4 py-2 text-right">Current Price</th>
                <th className="px-4 py-2 text-right">Change</th>
                <th className="px-4 py-2 text-center">Trust Score</th>
                <th className="px-4 py-2 text-right">Last Checked</th>
                <th className="px-4 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredSources.map((source) => {
                const deviation = getDeviation(source.current_price, source.previous_price);
                return (
                  <tr key={source.id} className="border-b last:border-0 hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline font-medium"
                      >
                        {source.retailer}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {source.variant_name || "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {source.current_price != null
                        ? `${source.currency} ${source.current_price.toFixed(2)}`
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {deviation !== null ? (
                        <span className={`font-medium ${
                          deviation > 0 ? "text-red-500" : deviation < 0 ? "text-emerald-500" : "text-gray-400"
                        }`}>
                          {deviation > 0 ? "+" : ""}{deviation.toFixed(1)}%
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {source.trust_score != null ? (
                        <Link
                          href={`/trust/${getDomain(source.url)}`}
                          className="inline-flex items-center gap-1.5 hover:opacity-80 transition"
                        >
                          <TrustBadge score={source.trust_score} />
                          <span className="text-xs text-gray-500 hover:text-emerald-600">{source.trust_score}/100</span>
                        </Link>
                      ) : (
                        <span className="flex items-center justify-center gap-1 text-xs text-gray-400">
                          <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
                          Scoring...
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400">
                      {source.last_checked_at
                        ? new Date(source.last_checked_at.replace(" ", "T") + "Z").toLocaleString("en-GB", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                          })
                        : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRemoveSource(source.id)}
                        className="text-gray-300 hover:text-red-500 transition"
                        title="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredSources.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    {product.sources.length === 0 ? "No sources yet. Go back and find prices." : "No sources match the selected filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-400">
          Prices are fetched directly from retailer websites and may differ from what you see due to dynamic pricing, location, or login status. Always click through to verify before purchasing.
        </div>
      </div>

      {/* Review Summary */}
      <div className="bg-white border rounded-lg">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Review Summary</h2>
          {!review && !reviewLoading && (
            <button
              onClick={fetchReview}
              className="text-xs px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full hover:bg-emerald-200 transition font-medium"
            >
              Load Reviews
            </button>
          )}
        </div>
        <div className="px-4 py-4">
          {reviewLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
              Searching for reviews...
            </div>
          )}
          {review && (
            <div className="space-y-3">
              {review.rating != null && (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-emerald-600">{review.rating.toFixed(1)}</span>
                  <span className="text-sm text-gray-500">/ 5</span>
                  <div className="flex gap-0.5 ml-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg
                        key={star}
                        className={`w-4 h-4 ${star <= Math.round(review.rating!) ? "text-yellow-400" : "text-gray-200"}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-sm text-gray-700">{review.summary}</p>
              <div className="grid grid-cols-2 gap-4">
                {review.pros.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-emerald-700 uppercase mb-1">Pros</h3>
                    <ul className="space-y-1">
                      {review.pros.map((p, i) => (
                        <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                          <span className="text-emerald-500 mt-0.5">+</span> {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {review.cons.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-red-700 uppercase mb-1">Cons</h3>
                    <ul className="space-y-1">
                      {review.cons.map((c, i) => (
                        <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                          <span className="text-red-500 mt-0.5">-</span> {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {review.verdict && (
                <div className="bg-gray-50 rounded p-2 mt-2">
                  <span className="text-xs font-semibold text-gray-700">Verdict: </span>
                  <span className="text-xs text-gray-600">{review.verdict}</span>
                </div>
              )}
            </div>
          )}
          {!review && !reviewLoading && (
            <p className="text-sm text-gray-400">Click &quot;Load Reviews&quot; to see what people think about this product.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function getDeviation(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function TrustBadge({ score }: { score: number }) {
  let color = "bg-red-500";
  if (score >= 70) color = "bg-emerald-500";
  else if (score >= 50) color = "bg-yellow-500";

  const width = Math.max(0, Math.min(100, score));

  return (
    <div className="w-12 h-2 bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}
