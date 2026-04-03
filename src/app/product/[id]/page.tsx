"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRegion } from "@/components/RegionContext";
import PriceChart from "@/components/PriceChart";
import FrequencySelector from "@/components/FrequencySelector";
import type { CheckFrequency } from "@/lib/db";

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

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { region } = useRegion();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scoringSource, setScoringSource] = useState<number | null>(null);

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

  async function handleTrustScore(sourceId: number) {
    setScoringSource(sourceId);
    try {
      await fetch(`/api/products/${id}/sources/${sourceId}/trust`, { method: "POST" });
      await fetchData();
    } catch (err) {
      console.error("Trust score failed:", err);
    }
    setScoringSource(null);
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
      {/* Back link */}
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
        <div className="flex items-center gap-2">
          <FrequencySelector
            frequency={product.check_frequency}
            checkDay={product.check_day}
            onChange={handleFrequencyChange}
            compact
          />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {refreshing ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Refreshing...
              </span>
            ) : (
              "Refresh Prices"
            )}
          </button>
        </div>
      </div>

      {/* Price chart */}
      <div className="bg-white border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Price History</h2>
        <PriceChart history={history} currency={product.currency} desiredPrice={product.desired_price} />
      </div>

      {/* Source table */}
      <div className="bg-white border rounded-lg">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-gray-700">
            Tracked Sources ({product.sources.length}/10)
          </h2>
        </div>
        <div className="overflow-x-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-2">Retailer</th>
                <th className="px-4 py-2 text-right">Current Price</th>
                <th className="px-4 py-2 text-right">Change</th>
                <th className="px-4 py-2 text-center">Trust Score</th>
                <th className="px-4 py-2 text-right">Last Checked</th>
                <th className="px-4 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {product.sources.map((source) => {
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
              {product.sources.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No sources yet. Go back and find prices.
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
