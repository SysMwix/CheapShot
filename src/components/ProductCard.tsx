"use client";

import Sparkline from "./Sparkline";

export interface ProductCardData {
  id: number;
  name: string;
  url: string;
  image_url: string | null;
  current_price: number | null;
  desired_price: number;
  currency: string;
  priceHistory: number[];
}

function getTrend(history: number[]): "up" | "down" | "stable" {
  if (history.length < 2) return "stable";
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (last > prev) return "up";
  if (last < prev) return "down";
  return "stable";
}

const trendIcons = {
  up: "↑",
  down: "↓",
  stable: "→",
};

const trendColors = {
  up: "text-red-500",
  down: "text-emerald-500",
  stable: "text-gray-400",
};

interface ProductCardProps {
  product: ProductCardData;
  onCheckPrice: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function ProductCard({ product, onCheckPrice, onDelete }: ProductCardProps) {
  const isAlert =
    product.current_price != null && product.current_price <= product.desired_price;
  const trend = getTrend(product.priceHistory);

  return (
    <div
      className={`rounded-lg border p-4 bg-white shadow-sm transition ${
        isAlert ? "border-emerald-400 ring-2 ring-emerald-100" : "border-gray-200"
      }`}
    >
      {isAlert && (
        <span className="inline-block mb-2 px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">
          Price Alert!
        </span>
      )}

      <div className="flex gap-3">
        {product.image_url && (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-16 h-16 object-cover rounded"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{product.name}</h3>
          <a
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline truncate block"
          >
            {product.url}
          </a>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold">
              {product.current_price != null
                ? `${product.currency} ${product.current_price.toFixed(2)}`
                : "—"}
            </span>
            <span className={`text-sm font-medium ${trendColors[trend]}`}>
              {trendIcons[trend]}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            Target: {product.currency} {product.desired_price.toFixed(2)}
          </div>
        </div>
        <Sparkline
          data={product.priceHistory}
          color={isAlert ? "#10b981" : "#6b7280"}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onCheckPrice(product.id)}
          className="flex-1 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded font-medium transition"
        >
          Check Price
        </button>
        <button
          onClick={() => onDelete(product.id)}
          className="text-xs px-3 py-1.5 text-red-500 hover:bg-red-50 rounded font-medium transition"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
