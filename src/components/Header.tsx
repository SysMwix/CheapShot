"use client";

import { useState, useRef, useEffect } from "react";
import { useRegion, REGIONS } from "./RegionContext";

export default function Header() {
  const { region, setRegion } = useRegion();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <h1 className="text-2xl font-bold tracking-tight">
        Cheap<span className="text-emerald-600">Shot</span>
      </h1>

      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 transition"
        >
          <span className="text-base">{regionFlag(region.flag)}</span>
          <span className="font-medium">{region.code}</span>
          <span className="text-gray-400">{region.currency}</span>
          <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 10 6">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 mt-1 w-56 bg-white border rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
            {REGIONS.map((r) => (
              <button
                key={r.code}
                onClick={() => {
                  setRegion(r);
                  setOpen(false);
                }}
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
