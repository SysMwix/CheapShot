"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRegion, REGIONS, TRUST_LEVELS } from "./RegionContext";

export default function Header() {
  const { region, setRegion, minTrust, setMinTrust } = useRegion();
  const [openRegion, setOpenRegion] = useState(false);
  const [openTrust, setOpenTrust] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const trustRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (regionRef.current && !regionRef.current.contains(e.target as Node)) setOpenRegion(false);
      if (trustRef.current && !trustRef.current.contains(e.target as Node)) setOpenTrust(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const trustLabel = TRUST_LEVELS.find((t) => t.value === minTrust)?.label || "Any";

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <Link href="/" className="text-2xl font-bold tracking-tight hover:opacity-80 transition">
        Cheap<span className="text-emerald-600">Shot</span>
      </Link>

      <div className="flex items-center gap-2">
        {/* Trust score selector */}
        <div className="relative" ref={trustRef}>
          <button
            onClick={() => setOpenTrust(!openTrust)}
            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 transition"
          >
            <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-gray-600">Trust: {trustLabel}</span>
            <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 10 6">
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {openTrust && (
            <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg z-50">
              <div className="px-3 py-2 border-b text-xs text-gray-500">Min Trust Score</div>
              {TRUST_LEVELS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => { setMinTrust(t.value); setOpenTrust(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition ${
                    t.value === minTrust ? "bg-emerald-50 text-emerald-700" : ""
                  }`}
                >
                  {t.value === 0 ? "No minimum" : `${t.label} — ${t.value === 30 ? "Avoid scams" : t.value === 50 ? "Moderate" : t.value === 70 ? "Well trusted" : "Major only"}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Region selector */}
        <div className="relative" ref={regionRef}>
          <button
            onClick={() => setOpenRegion(!openRegion)}
            className="flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 transition"
          >
            <span className="text-base">{regionFlag(region.flag)}</span>
            <span className="font-medium">{region.code}</span>
            <span className="text-gray-400">{region.currency}</span>
            <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 10 6">
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {openRegion && (
            <div className="absolute right-0 mt-1 w-56 bg-white border rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
              {REGIONS.map((r) => (
                <button
                  key={r.code}
                  onClick={() => { setRegion(r); setOpenRegion(false); }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 transition ${
                    r.code === region.code ? "bg-emerald-50 text-emerald-700" : ""
                  }`}
                >
                  <span className="text-base">{regionFlag(r.flag)}</span>
                  <span className="flex-1">{r.name}</span>
                  <span className="text-gray-400 text-xs">{r.currency}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function regionFlag(code: string): string {
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + code.charCodeAt(0) - 65,
    base + code.charCodeAt(1) - 65
  );
}
