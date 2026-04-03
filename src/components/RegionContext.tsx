"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface Region {
  code: string;
  name: string;
  currency: string;
  flag: string;
}

export const REGIONS: Region[] = [
  { code: "GB", name: "United Kingdom", currency: "GBP", flag: "GB" },
  { code: "US", name: "United States", currency: "USD", flag: "US" },
  { code: "CA", name: "Canada", currency: "CAD", flag: "CA" },
  { code: "AU", name: "Australia", currency: "AUD", flag: "AU" },
  { code: "DE", name: "Germany", currency: "EUR", flag: "DE" },
  { code: "FR", name: "France", currency: "EUR", flag: "FR" },
  { code: "IE", name: "Ireland", currency: "EUR", flag: "IE" },
  { code: "NL", name: "Netherlands", currency: "EUR", flag: "NL" },
  { code: "ES", name: "Spain", currency: "EUR", flag: "ES" },
  { code: "IT", name: "Italy", currency: "EUR", flag: "IT" },
  { code: "JP", name: "Japan", currency: "JPY", flag: "JP" },
  { code: "IN", name: "India", currency: "INR", flag: "IN" },
  { code: "NZ", name: "New Zealand", currency: "NZD", flag: "NZ" },
];

const STORAGE_KEY = "cheapshot-region";

interface RegionContextValue {
  region: Region;
  setRegion: (region: Region) => void;
}

const RegionContext = createContext<RegionContextValue | null>(null);

export function RegionProvider({ children }: { children: ReactNode }) {
  const [region, setRegionState] = useState<Region>(REGIONS[0]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const found = REGIONS.find((r) => r.code === saved);
      if (found) setRegionState(found);
    }
    setLoaded(true);
  }, []);

  function setRegion(r: Region) {
    setRegionState(r);
    localStorage.setItem(STORAGE_KEY, r.code);
  }

  if (!loaded) return null;

  return (
    <RegionContext.Provider value={{ region, setRegion }}>
      {children}
    </RegionContext.Provider>
  );
}

export function useRegion() {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error("useRegion must be used within RegionProvider");
  return ctx;
}
