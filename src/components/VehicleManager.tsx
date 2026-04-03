"use client";

import { useState } from "react";
import { useRegion, SavedVehicle } from "./RegionContext";

interface VehicleManagerProps {
  vehicleType: "car" | "motorbike";
}

export default function VehicleManager({ vehicleType }: VehicleManagerProps) {
  const { vehicles, addVehicle, removeVehicle } = useRegion();
  const [mode, setMode] = useState<"reg" | "manual">("reg");
  const [reg, setReg] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");

  const filteredVehicles = vehicles.filter((v) => v.type === vehicleType);

  async function handleRegLookup(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = reg.replace(/\s+/g, "").toUpperCase();
    if (!cleaned) return;

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
        if (data.error === "No DVLA API key configured") {
          setError("No DVLA API key — use manual entry instead");
          setMode("manual");
        } else {
          setError(data.error || "Vehicle not found — try manual entry");
        }
        setLooking(false);
        return;
      }

      const data = await res.json();
      addVehicle({ ...data, type: vehicleType });
      setReg("");
    } catch {
      setError("Lookup failed — try manual entry");
    }
    setLooking(false);
  }

  function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!make.trim() || !model.trim()) return;

    const registration = reg.replace(/\s+/g, "").toUpperCase() || `MANUAL-${Date.now()}`;

    if (vehicles.some((v) => v.registration === registration)) {
      setError("Vehicle already saved");
      return;
    }

    addVehicle({
      registration,
      make: make.trim().toUpperCase(),
      model: model.trim().toUpperCase(),
      year: parseInt(year) || 0,
      colour: "",
      fuelType: "",
      type: vehicleType,
    });

    setReg("");
    setMake("");
    setModel("");
    setYear("");
    setError("");
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
                  {!v.registration.startsWith("MANUAL") && (
                    <span className="bg-yellow-300 text-black text-xs font-bold px-2 py-0.5 rounded">
                      {v.registration}
                    </span>
                  )}
                  <span className="text-sm font-medium">{v.make} {v.model}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {v.year ? `${v.year} ` : ""}{v.colour} {v.fuelType}
                </span>
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

      {/* Mode toggle */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => setMode("reg")}
          className={`text-xs px-2 py-1 rounded transition ${mode === "reg" ? "bg-emerald-100 text-emerald-700 font-medium" : "text-gray-500 hover:bg-gray-100"}`}
        >
          Reg Lookup
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`text-xs px-2 py-1 rounded transition ${mode === "manual" ? "bg-emerald-100 text-emerald-700 font-medium" : "text-gray-500 hover:bg-gray-100"}`}
        >
          Manual Entry
        </button>
      </div>

      {mode === "reg" ? (
        <form onSubmit={handleRegLookup} className="flex gap-2">
          <input
            type="text"
            value={reg}
            onChange={(e) => { setReg(e.target.value.toUpperCase()); setError(""); }}
            placeholder="Enter reg e.g. AB12 CDE"
            className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 uppercase"
            maxLength={8}
            disabled={looking}
          />
          <button
            type="submit"
            disabled={looking || !reg.trim()}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition disabled:opacity-50"
          >
            {looking ? "Looking..." : "+ Add"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleManualAdd} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={make}
              onChange={(e) => setMake(e.target.value)}
              placeholder="Make e.g. MINI"
              className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              required
            />
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model e.g. Clubman"
              className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              required
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="Year e.g. 2010"
              className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              maxLength={4}
            />
            <input
              type="text"
              value={reg}
              onChange={(e) => setReg(e.target.value.toUpperCase())}
              placeholder="Reg (optional)"
              className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 uppercase"
              maxLength={8}
            />
            <button
              type="submit"
              disabled={!make.trim() || !model.trim()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition disabled:opacity-50"
            >
              + Add
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <p className="text-xs text-gray-400 mt-1">
        {mode === "reg"
          ? "Needs a DVLA API key in .env.local — or switch to manual entry."
          : "Enter make, model and year to help find the right parts."}
      </p>
    </div>
  );
}
