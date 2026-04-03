"use client";

import { useState } from "react";
import { useRegion, SavedVehicle } from "./RegionContext";

interface VehicleManagerProps {
  /** Only show vehicles of this type */
  vehicleType: "car" | "motorbike";
}

export default function VehicleManager({ vehicleType }: VehicleManagerProps) {
  const { vehicles, addVehicle, removeVehicle } = useRegion();
  const [reg, setReg] = useState("");
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");

  const filteredVehicles = vehicles.filter((v) => v.type === vehicleType);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = reg.replace(/\s+/g, "").toUpperCase();
    if (!cleaned) return;

    // Check if already saved
    if (vehicles.some((v) => v.registration === cleaned)) {
      setError("Vehicle already saved");
      return;
    }

    setLooking(true);
    setError("");

    try {
      const res = await fetch(`/api/vehicle?reg=${encodeURIComponent(cleaned)}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Vehicle not found");
        setLooking(false);
        return;
      }

      const data = await res.json();
      const vehicle: SavedVehicle = {
        registration: data.registration,
        make: data.make,
        model: data.model,
        year: data.year,
        colour: data.colour,
        fuelType: data.fuelType,
        engineSize: data.engineSize,
        type: vehicleType,
      };

      addVehicle(vehicle);
      setReg("");
    } catch {
      setError("Lookup failed — check the registration");
    }
    setLooking(false);
  }

  return (
    <div className="bg-white border rounded-lg p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">
        My {vehicleType === "car" ? "Vehicles" : "Bikes"}
      </h2>

      {/* Saved vehicles */}
      {filteredVehicles.length > 0 && (
        <div className="space-y-2 mb-3">
          {filteredVehicles.map((v) => (
            <div key={v.registration} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-yellow-300 text-black text-xs font-bold px-2 py-0.5 rounded">
                    {v.registration}
                  </span>
                  <span className="text-sm font-medium">{v.make} {v.model}</span>
                </div>
                <span className="text-xs text-gray-400">{v.year} {v.colour} {v.fuelType}</span>
              </div>
              <button
                onClick={() => removeVehicle(v.registration)}
                className="text-gray-300 hover:text-red-500 transition"
                title="Remove"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add vehicle form */}
      <form onSubmit={handleLookup} className="flex gap-2">
        <input
          type="text"
          value={reg}
          onChange={(e) => { setReg(e.target.value.toUpperCase()); setError(""); }}
          placeholder="Enter reg plate e.g. AB12 CDE"
          className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 uppercase"
          maxLength={8}
          disabled={looking}
        />
        <button
          type="submit"
          disabled={looking || !reg.trim()}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition disabled:opacity-50"
        >
          {looking ? "Looking up..." : "+ Add"}
        </button>
      </form>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <p className="text-xs text-gray-400 mt-1">
        Enter a UK registration to auto-detect make, model and year for better search results.
      </p>
    </div>
  );
}
