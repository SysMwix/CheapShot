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

export interface SizePreferences {
  helmetSize: string;
  gloveSize: string;
  jacketSize: string;
  leatherSuitSize: string;
  backProtectorSize: string;
  kneeSliderSize: string;
  tShirtSize: string;
  shoeSize: string;
  bootSize: string;
  waist: string;
  jeansSize: string;
}

export const SIZE_OPTIONS: Record<keyof SizePreferences, { label: string; options: string[] }> = {
  helmetSize: { label: "Helmet", options: ["", "XS", "S", "M", "L", "XL", "XXL"] },
  gloveSize: { label: "Gloves", options: ["", "XS", "S", "M", "L", "XL", "XXL"] },
  jacketSize: { label: "Jacket", options: ["", "XS", "S", "M", "L", "XL", "XXL", "3XL", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54"] },
  leatherSuitSize: { label: "Leather Suit", options: ["", "XS", "S", "M", "L", "XL", "XXL", "3XL", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54"] },
  backProtectorSize: { label: "Back Protector", options: ["", "XS", "S", "M", "L", "XL", "XXL"] },
  kneeSliderSize: { label: "Knee Sliders", options: ["", "One Size", "S", "M", "L"] },
  tShirtSize: { label: "T-Shirt / Top", options: ["", "XS", "S", "M", "L", "XL", "XXL", "3XL"] },
  shoeSize: { label: "Shoe Size", options: ["", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"] },
  bootSize: { label: "Boot Size", options: ["", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"] },
  waist: { label: "Waist", options: ["", "26", "28", "30", "32", "34", "36", "38", "40", "42", "44"] },
  jeansSize: { label: "Jeans (W/L)", options: ["", "W28/L30", "W28/L32", "W30/L30", "W30/L32", "W30/L34", "W32/L30", "W32/L32", "W32/L34", "W34/L30", "W34/L32", "W34/L34", "W36/L30", "W36/L32", "W36/L34", "W38/L32", "W38/L34", "W40/L32", "W40/L34"] },
};

const DEFAULT_SIZES: SizePreferences = {
  helmetSize: "", gloveSize: "", jacketSize: "", leatherSuitSize: "",
  backProtectorSize: "", kneeSliderSize: "", tShirtSize: "", shoeSize: "",
  bootSize: "", waist: "", jeansSize: "",
};

const REGION_KEY = "cheapshot-region";
const TRUST_KEY = "cheapshot-min-trust";
const SIZES_KEY = "cheapshot-sizes";

interface SettingsContextValue {
  region: Region;
  setRegion: (region: Region) => void;
  minTrust: number;
  setMinTrust: (score: number) => void;
  sizes: SizePreferences;
  setSizes: (sizes: SizePreferences) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function RegionProvider({ children }: { children: ReactNode }) {
  const [region, setRegionState] = useState<Region>(REGIONS[0]);
  const [minTrust, setMinTrustState] = useState(0);
  const [sizes, setSizesState] = useState<SizePreferences>(DEFAULT_SIZES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const savedRegion = localStorage.getItem(REGION_KEY);
    if (savedRegion) {
      const found = REGIONS.find((r) => r.code === savedRegion);
      if (found) setRegionState(found);
    }
    const savedTrust = localStorage.getItem(TRUST_KEY);
    if (savedTrust) setMinTrustState(parseInt(savedTrust) || 0);
    const savedSizes = localStorage.getItem(SIZES_KEY);
    if (savedSizes) {
      try { setSizesState({ ...DEFAULT_SIZES, ...JSON.parse(savedSizes) }); } catch { /* ignore */ }
    }
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

  function setSizes(s: SizePreferences) {
    setSizesState(s);
    localStorage.setItem(SIZES_KEY, JSON.stringify(s));
  }

  if (!loaded) return null;

  return (
    <SettingsContext.Provider value={{ region, setRegion, minTrust, setMinTrust, sizes, setSizes }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useRegion() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useRegion must be used within RegionProvider");
  return ctx;
}
