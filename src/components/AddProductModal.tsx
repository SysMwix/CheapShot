"use client";

import { useState, useEffect, useRef } from "react";
import { useRegion } from "./RegionContext";

interface ProductOffer {
  name: string;
  price: number;
  currency: string;
  url: string;
  retailer: string;
  image_url?: string;
}

interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  initialQuery?: string;
}

export default function AddProductModal({ open, onClose, onAdded, initialQuery = "" }: AddProductModalProps) {
  const { region } = useRegion();
  const [query, setQuery] = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [offers, setOffers] = useState<ProductOffer[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ProductOffer | null>(null);
  const [desiredPrice, setDesiredPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setOffers([]);
      setDismissed(new Set());
      setSelected(null);
      setError("");
      setStatusMsg("");
    }
  }, [open, initialQuery]);

  if (!open) return null;

  function handleClose() {
    if (abortRef.current) abortRef.current.abort();
    setQuery("");
    setOffers([]);
    setDismissed(new Set());
    setSelected(null);
    setDesiredPrice("");
    setError("");
    setStatusMsg("");
    setSearching(false);
    setSaving(false);
    onClose();
  }

  async function doSearch(excludeRetailers?: string[]) {
    if (!query.trim()) return;

    setError("");
    setSearching(true);
    setStatusMsg("Searching the web...");
    if (!excludeRetailers) {
      setOffers([]);
    }

    if (abortRef.current) abortRef.current.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          country: region.name,
          currency: region.currency,
          excludeRetailers,
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error("Search failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7);
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "status") {
                setStatusMsg(data.message);
              } else if (currentEvent === "offer") {
                setOffers((prev) => [...prev, data as ProductOffer]);
              } else if (currentEvent === "done") {
                setStatusMsg("");
              } else if (currentEvent === "error") {
                setError(data.message);
              }
            } catch {
              // skip malformed data
            }
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Search failed");
      }
    } finally {
      setSearching(false);
      setStatusMsg("");
      abortRef.current = null;
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setDismissed(new Set());
    doSearch();
  }

  function handleDismiss(retailer: string) {
    setDismissed((prev) => new Set([...prev, retailer]));
  }

  function handleResearch() {
    const excludeList = Array.from(dismissed);
    doSearch(excludeList);
  }

  function handleSelect(offer: ProductOffer) {
    setSelected(offer);
    setDesiredPrice(offer.price.toString());
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selected.name,
          url: selected.url,
          image_url: selected.image_url || null,
          desired_price: parseFloat(desiredPrice),
          currency: selected.currency,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      const product = await res.json();

      await fetch(`/api/products/${product.id}/check-price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: selected.price }),
      });

      handleClose();
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const visibleOffers = offers.filter((o) => !dismissed.has(o.retailer));
  const showResults = offers.length > 0 || searching;
  const showConfirm = selected !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            {showConfirm ? "Set Your Target Price" : "Find a Product"}
          </h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl">
            &times;
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2 text-sm bg-red-50 text-red-600 rounded">{error}</div>
        )}

        {/* Confirm selected offer */}
        {showConfirm && selected ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="flex gap-3">
                {selected.image_url && (
                  <img
                    src={selected.image_url}
                    alt={selected.name}
                    className="w-14 h-14 object-cover rounded flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium">{selected.name}</h4>
                  <p className="text-xs text-gray-500">{selected.retailer}</p>
                  <p className="text-base font-bold mt-1">
                    {selected.currency} {selected.price.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Alert me when price drops to ({selected.currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={desiredPrice}
                onChange={(e) => setDesiredPrice(e.target.value)}
                required
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">
                Current price: {selected.currency} {selected.price.toFixed(2)}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex-1 py-2 border rounded font-medium text-sm hover:bg-gray-50 transition"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-sm transition disabled:opacity-50"
              >
                {saving ? "Saving..." : "Track This Product"}
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Search bar — always visible */}
            <form onSubmit={handleSearch} className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder='e.g. "Sony WH-1000XM5 headphones"'
                  className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus={!showResults}
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-sm transition disabled:opacity-50"
                >
                  {searching ? (
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    "Search"
                  )}
                </button>
              </div>
            </form>

            {/* Status message */}
            {statusMsg && (
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
                {statusMsg}
              </div>
            )}

            {/* Skeleton loaders while searching and no results yet */}
            {searching && visibleOffers.length === 0 && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border rounded-lg p-3 animate-pulse">
                    <div className="flex gap-3">
                      <div className="w-14 h-14 bg-gray-200 rounded flex-shrink-0" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-3 bg-gray-200 rounded w-3/4" />
                        <div className="h-2 bg-gray-100 rounded w-1/3" />
                        <div className="h-4 bg-gray-200 rounded w-1/4" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Results */}
            {visibleOffers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  {searching ? "Results so far..." : `Found ${visibleOffers.length} offer${visibleOffers.length !== 1 ? "s" : ""}`}
                  {" "}— pick one to track:
                </p>

                {visibleOffers.map((offer, i) => (
                  <div
                    key={`${offer.retailer}-${i}`}
                    className="relative border rounded-lg p-3 hover:border-emerald-400 hover:bg-emerald-50/50 transition group"
                  >
                    <button
                      onClick={() => handleDismiss(offer.retailer)}
                      className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      title={`Remove ${offer.retailer}`}
                    >
                      &times;
                    </button>

                    <button
                      onClick={() => handleSelect(offer)}
                      className="w-full text-left"
                    >
                      <div className="flex gap-3">
                        {offer.image_url && (
                          <img
                            src={offer.image_url}
                            alt={offer.name}
                            className="w-14 h-14 object-cover rounded flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium truncate pr-6">{offer.name}</h4>
                          <p className="text-xs text-gray-500">{offer.retailer}</p>
                          <p className="text-base font-bold text-emerald-700 mt-1">
                            {offer.currency} {offer.price.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                ))}

                {/* Re-search button when items have been dismissed */}
                {dismissed.size > 0 && !searching && (
                  <button
                    onClick={handleResearch}
                    className="w-full py-2 mt-1 border border-dashed border-emerald-300 text-emerald-600 rounded-lg text-sm font-medium hover:bg-emerald-50 transition"
                  >
                    Search again (excluding {dismissed.size} retailer{dismissed.size !== 1 ? "s" : ""})
                  </button>
                )}
              </div>
            )}

            {/* No results after search complete */}
            {!searching && offers.length === 0 && showResults && (
              <div className="text-center py-6">
                <p className="text-gray-400">No offers found. Try a different search.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
