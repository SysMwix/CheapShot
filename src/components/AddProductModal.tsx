"use client";

import { useState } from "react";
import { useRegion } from "./RegionContext";
import FrequencySelector from "./FrequencySelector";
import type { CheckFrequency } from "@/lib/db";

interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
  onAdded: (productId: number) => void;
}

export default function AddProductModal({ open, onClose, onAdded }: AddProductModalProps) {
  const { region, minTrust: globalMinTrust } = useRegion();
  const [name, setName] = useState("");
  const [desiredPrice, setDesiredPrice] = useState("");
  const [checkFrequency, setCheckFrequency] = useState<CheckFrequency>("manual");
  const [checkDay, setCheckDay] = useState<number | null>(null);
  const [minTrust, setMinTrust] = useState(globalMinTrust.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          desired_price: desiredPrice ? parseFloat(desiredPrice) : null,
          currency: region.currency,
          check_frequency: checkFrequency,
          check_day: checkDay,
          min_trust_score: parseInt(minTrust) || 0,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add");
      }

      const product = await res.json();
      setName("");
      setDesiredPrice("");
      setCheckFrequency("manual");
      setCheckDay(null);
      setMinTrust("0");
      onAdded(product.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Track a Product</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            &times;
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2 text-sm bg-red-50 text-red-600 rounded">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Product Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder='e.g. "Cardo Packtalk Edge"'
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Target Price ({region.currency}) <span className="text-gray-400 font-normal">— optional</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={desiredPrice}
              onChange={(e) => setDesiredPrice(e.target.value)}
              placeholder="Leave blank to set later"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Check Frequency</label>
            <FrequencySelector
              frequency={checkFrequency}
              checkDay={checkDay}
              onChange={(freq, day) => {
                setCheckFrequency(freq);
                setCheckDay(day);
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Min Trust Score <span className="text-gray-400 font-normal">— hide untrusted sites</span>
            </label>
            <select
              value={minTrust}
              onChange={(e) => setMinTrust(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="0">No minimum</option>
              <option value="30">30+ (Avoid scams)</option>
              <option value="50">50+ (Moderate trust)</option>
              <option value="70">70+ (Well trusted only)</option>
              <option value="90">90+ (Major retailers only)</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-sm transition disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add & Find Prices"}
          </button>
        </form>
      </div>
    </div>
  );
}
