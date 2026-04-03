"use client";

import { useState, useEffect } from "react";

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
  const [step, setStep] = useState<"search" | "results" | "confirm">("search");
  const [query, setQuery] = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [offers, setOffers] = useState<ProductOffer[]>([]);
  const [selected, setSelected] = useState<ProductOffer | null>(null);
  const [desiredPrice, setDesiredPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setStep("search");
    }
  }, [open, initialQuery]);

  if (!open) return null;

  function reset() {
    setStep("search");
    setQuery("");
    setOffers([]);
    setSelected(null);
    setDesiredPrice("");
    setError("");
    setSearching(false);
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setError("");
    setSearching(true);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Search failed");
      }

      const results: ProductOffer[] = await res.json();
      setOffers(results);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function handleSelect(offer: ProductOffer) {
    setSelected(offer);
    setDesiredPrice(offer.price.toString());
    setStep("confirm");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    setSaving(true);
    setError("");

    try {
      // Create the product
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

      // Log the initial price to history
      await fetch(`/api/products/${product.id}/check-price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: selected.price }),
      });

      reset();
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">
            {step === "search" && "Search for a Product"}
            {step === "results" && "Pick an Offer"}
            {step === "confirm" && "Set Your Target Price"}
          </h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl">
            &times;
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2 text-sm bg-red-50 text-red-600 rounded">{error}</div>
        )}

        {/* Step 1: Search */}
        {step === "search" && (
          <form onSubmit={handleSearch} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">What are you looking for?</label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='e.g. "Sony WH-1000XM5 headphones"'
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-sm transition disabled:opacity-50"
            >
              {searching ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Searching with AI...
                </span>
              ) : (
                "Search"
              )}
            </button>
          </form>
        )}

        {/* Step 2: Pick from results */}
        {step === "results" && (
          <div className="space-y-3">
            {offers.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-400 mb-2">No offers found.</p>
                <button
                  onClick={() => setStep("search")}
                  className="text-emerald-600 hover:underline text-sm font-medium"
                >
                  Try a different search
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500">
                  Found {offers.length} offer{offers.length !== 1 && "s"} — pick one to track:
                </p>
                {offers.map((offer, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect(offer)}
                    className="w-full text-left border rounded-lg p-3 hover:border-emerald-400 hover:bg-emerald-50/50 transition"
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
                        <h4 className="text-sm font-medium truncate">{offer.name}</h4>
                        <p className="text-xs text-gray-500">{offer.retailer}</p>
                        <p className="text-base font-bold text-emerald-700 mt-1">
                          {offer.currency} {offer.price.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => setStep("search")}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-1"
                >
                  &larr; Search again
                </button>
              </>
            )}
          </div>
        )}

        {/* Step 3: Set desired price and confirm */}
        {step === "confirm" && selected && (
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
                onClick={() => setStep("results")}
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
        )}
      </div>
    </div>
  );
}
