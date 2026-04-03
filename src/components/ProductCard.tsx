"use client";

import { useState } from "react";
import Sparkline from "./Sparkline";

export interface SourceData {
  id: number;
  retailer: string;
  url: string;
  image_url: string | null;
  current_price: number | null;
  currency: string;
}

export interface ProductCardData {
  id: number;
  name: string;
  desired_price: number | null;
  currency: string;
  search_status: string;
  sources: SourceData[];
  best_price: number | null;
  priceHistory: number[];
}

interface ProductCardProps {
  product: ProductCardData;
  onDelete: (id: number) => void;
  onRemoveSource: (productId: number, sourceId: number) => void;
  onFindMore: (productId: number) => void;
}

function getTrend(history: number[]): "up" | "down" | "stable" {
  if (history.length < 2) return "stable";
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (last > prev) return "up";
  if (last < prev) return "down";
  return "stable";
}

const trendIcons = { up: "\u2191", down: "\u2193", stable: "\u2192" };
const trendColors = { up: "text-red-500", down: "text-emerald-500", stable: "text-gray-400" };

export default function ProductCard({ product, onDelete, onRemoveSource, onFindMore }: ProductCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isSearching = product.search_status === "searching" || product.search_status === "pending";
  const isAlert = product.best_price != null && product.desired_price != null && product.best_price <= product.desired_price;
  const trend = getTrend(product.priceHistory);
  const displaySources = expanded ? product.sources : product.sources.slice(0, 3);
  const hasMore = product.sources.length > 3;

  return (
    <div
      className={`rounded-lg border bg-white shadow-sm transition ${
        isAlert ? "border-emerald-400 ring-2 ring-emerald-100" : "border-gray-200"
      }`}
    >
      {/* Header */}
      <div className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {isAlert && (
              <span className="inline-block mb-1 px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">
                Price Alert!
              </span>
            )}
            <h3 className="font-semibold text-sm">{product.name}</h3>
          </div>
          <button
            onClick={() => onDelete(product.id)}
            className="text-gray-300 hover:text-red-500 transition flex-shrink-0"
            title="Remove product"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Price summary */}
        <div className="mt-2 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold">
                {product.best_price != null
                  ? `${product.currency} ${product.best_price.toFixed(2)}`
                  : isSearching ? "" : "\u2014"}
              </span>
              {product.best_price != null && (
                <span className={`text-sm font-medium ${trendColors[trend]}`}>
                  {trendIcons[trend]}
                </span>
              )}
            </div>
            {product.desired_price != null && (
              <div className="text-xs text-gray-500">
                Target: {product.currency} {product.desired_price.toFixed(2)}
              </div>
            )}
          </div>
          <Sparkline
            data={product.priceHistory}
            color={isAlert ? "#10b981" : "#6b7280"}
          />
        </div>
      </div>

      {/* Loading state */}
      {isSearching && (
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
            Finding prices...
          </div>
          <div className="mt-2 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-2 py-1">
                <div className="h-3 bg-gray-200 rounded w-24" />
                <div className="flex-1" />
                <div className="h-3 bg-gray-200 rounded w-16" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sources list */}
      {!isSearching && product.sources.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100">
          <div className="text-xs text-gray-400 mb-1">
            {product.sources.length} source{product.sources.length !== 1 && "s"} tracked
          </div>
          <div className="space-y-1">
            {displaySources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-2 py-1 group text-sm"
              >
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline truncate flex-shrink min-w-0"
                  title={source.url}
                >
                  {source.retailer}
                </a>
                <span className="flex-1" />
                <span className="font-medium whitespace-nowrap">
                  {source.current_price != null
                    ? `${source.currency} ${source.current_price.toFixed(2)}`
                    : "\u2014"}
                </span>
                <button
                  onClick={() => onRemoveSource(product.id, source.id)}
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  title={`Remove ${source.retailer}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {hasMore && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-gray-400 hover:text-gray-600 mt-1"
            >
              +{product.sources.length - 3} more...
            </button>
          )}
          {expanded && hasMore && (
            <button
              onClick={() => setExpanded(false)}
              className="text-xs text-gray-400 hover:text-gray-600 mt-1"
            >
              Show less
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      {!isSearching && (
        <div className="px-4 py-2 border-t border-gray-100">
          {product.sources.length < 10 && (
            <button
              onClick={() => onFindMore(product.id)}
              className="w-full text-xs py-1.5 border border-dashed border-gray-300 text-gray-500 hover:border-emerald-400 hover:text-emerald-600 rounded font-medium transition"
            >
              + Find More Prices ({10 - product.sources.length} slots left)
            </button>
          )}
          {product.search_status === "error" && (
            <p className="text-xs text-red-400 mt-1 text-center">Search failed — try again</p>
          )}
        </div>
      )}
    </div>
  );
}
