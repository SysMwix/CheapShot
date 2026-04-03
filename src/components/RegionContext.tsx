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

export const TRUST_LEVELS = [
  { value: 0, label: "Any" },
  { value: 30, label: "30+" },
  { value: 50, label: "50+" },
  { value: 70, label: "70+" },
  { value: 90, label: "90+" },
];

const REGION_KEY = "cheapshot-region";
const TRUST_KEY = "cheapshot-min-trust";

interface SettingsContextValue {
  region: Region;
  setRegion: (region: Region) => void;
  minTrust: number;
  setMinTrust: (score: number) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function RegionProvider({ children }: { children: ReactNode }) {
  const [region, setRegionState] = useState<Region>(REGIONS[0]);
  const [minTrust, setMinTrustState] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const savedRegion = localStorage.getItem(REGION_KEY);
    if (savedRegion) {
      const found = REGIONS.find((r) => r.code === savedRegion);
      if (found) setRegionState(found);
    }
    const savedTrust = localStorage.getItem(TRUST_KEY);
    if (savedTrust) setMinTrustState(parseInt(savedTrust) || 0);
    setLoaded(true);
  }, []);

  function setRegion(r: Region) {
    setRegionState(r);
    localStorage.setItem(REGION_KEY, r.code);
  }

  function setMinTrust(score: number) {
    setMinTrustState(score);
    localStorage.setItem(TRUST_KEY, score.toString());
  }

  if (!loaded) return null;

  return (
    <SettingsContext.Provider value={{ region, setRegion, minTrust, setMinTrust }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useRegion() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useRegion must be used within RegionProvider");
  return ctx;
}
