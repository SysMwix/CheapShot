"use client";

import { useState } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onAdd: () => void;
  onRefreshAll: () => void;
  onClearAll?: () => void;
  refreshing?: boolean;
}

export default function SearchBar({ onSearch, onAdd, onRefreshAll, onClearAll, refreshing }: SearchBarProps) {
  const [query, setQuery] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  }

  return (
    <div className="flex gap-3">
      <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products or paste a URL..."
          className="flex-1 border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition"
        >
          Search
        </button>
      </form>
      <button
        onClick={onRefreshAll}
        disabled={refreshing}
        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition disabled:opacity-50"
      >
        {refreshing ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
            Refreshing...
          </span>
        ) : (
          "Refresh All"
        )}
      </button>
      {onClearAll && (
        <button
          onClick={onClearAll}
          disabled={refreshing}
          className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          Clear All Prices
        </button>
      )}
      <button
        onClick={onAdd}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition"
      >
        + Add Item
      </button>
    </div>
  );
}
