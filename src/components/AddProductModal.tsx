"use client";

import { useState, useEffect } from "react";
import { useRegion, SizePreferences, SavedVehicle } from "./RegionContext";
import { CATEGORIES, findSubcategory } from "@/lib/categories";
import FrequencySelector from "./FrequencySelector";
import type { CheckFrequency } from "@/lib/db";

export interface AddProductResult {
  productId: number;
  category: string;
  subcategory: string;
  sizeKey?: string;
  searchHint?: string;
}

interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
  onAdded: (result: AddProductResult) => void;
  defaultCategory?: string;
}

// Categories that can have a vehicle attached
const VEHICLE_CATEGORIES = ["auto", "motorbike"];

export default function AddProductModal({ open, onClose, onAdded, defaultCategory }: AddProductModalProps) {
  const { region, minTrust: globalMinTrust, sizes, vehicles } = useRegion();
  const [name, setName] = useState("");
  const [category, setCategory] = useState(defaultCategory || "");
  const [subcategory, setSubcategory] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [desiredPrice, setDesiredPrice] = useState("");
  const [checkFrequency, setCheckFrequency] = useState<CheckFrequency>("manual");
  const [checkDay, setCheckDay] = useState<number | null>(null);
  const [minTrust, setMinTrust] = useState(globalMinTrust.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setMinTrust(globalMinTrust.toString());
      setCategory(defaultCategory || "");
      setSubcategory("");
      setSelectedVehicle("");
    }
  }, [open, globalMinTrust, defaultCategory]);

  // Get vehicles relevant to the selected category
  const relevantVehicles = VEHICLE_CATEGORIES.includes(category)
    ? vehicles.filter((v) => (category === "auto" ? v.type === "car" : v.type === "motorbike"))
    : [];
  const vehicle = relevantVehicles.find((v) => v.registration === selectedVehicle);

  useEffect(() => {
    setSubcategory("");
  }, [category]);

  const selectedCategory = CATEGORIES.find((c) => c.slug === category);
  const selectedSub = category && subcategory ? findSubcategory(category, subcategory) : undefined;
  const savedSize = selectedSub?.sizeKey ? sizes[selectedSub.sizeKey as keyof SizePreferences] : "";

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError("");

    try {
      // Prefix product name with vehicle make/model if selected
      let productName = name.trim();
      if (vehicle) {
        const vehiclePrefix = `${vehicle.make} ${vehicle.model} ${vehicle.year}`;
        if (!productName.toLowerCase().includes(vehicle.make.toLowerCase())) {
          productName = `${vehiclePrefix} ${productName}`;
        }
      }

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productName,
          desired_price: desiredPrice ? parseFloat(desiredPrice) : null,
          currency: region.currency,
          check_frequency: checkFrequency,
          check_day: checkDay,
          min_trust_score: parseInt(minTrust) || 0,
          category: category || "misc",
          subcategory: subcategory || "other",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add");
      }

      const product = await res.json();
      const result: AddProductResult = {
        productId: product.id,
        category: category || "misc",
        subcategory: subcategory || "other",
        sizeKey: selectedSub?.sizeKey,
        searchHint: selectedSub?.searchHint,
      };
      setName("");
      setDesiredPrice("");
      setCategory(defaultCategory || "");
      setSubcategory("");
      setCheckFrequency("manual");
      setCheckDay(null);
      setMinTrust("0");
      onAdded(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6 max-h-[90vh] overflow-y-auto">
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
              placeholder='e.g. "HJC RPHA 91"'
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Any / General</option>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>

          {selectedCategory && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Type <span className="text-gray-400 font-normal">— refines search &amp; sizes</span>
              </label>
              <select
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Not specified</option>
                {selectedCategory.subcategories.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              {selectedSub?.sizeKey && savedSize && (
                <p className="text-xs text-emerald-600 mt-1">
                  Will search for your saved size: {savedSize}
                </p>
              )}
              {selectedSub?.sizeKey && !savedSize && (
                <p className="text-xs text-gray-400 mt-1">
                  No default size set for this — set one in &quot;My Sizes&quot; to auto-filter
                </p>
              )}
            </div>
          )}

          {/* Vehicle selector — only for auto/motorbike categories */}
          {relevantVehicles.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">
                For which vehicle? <span className="text-gray-400 font-normal">— auto-adds make/model to search</span>
              </label>
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">None / Generic</option>
                {relevantVehicles.map((v) => (
                  <option key={v.registration} value={v.registration}>
                    {v.registration} — {v.make} {v.model} {v.year}
                  </option>
                ))}
              </select>
              {vehicle && (
                <p className="text-xs text-emerald-600 mt-1">
                  Will search for: {vehicle.make} {vehicle.model} {vehicle.year} + your product name
                </p>
              )}
            </div>
          )}

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
