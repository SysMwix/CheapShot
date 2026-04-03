"use client";

import type { CheckFrequency } from "@/lib/db";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface FrequencySelectorProps {
  frequency: CheckFrequency;
  checkDay: number | null;
  onChange: (frequency: CheckFrequency, checkDay: number | null) => void;
  compact?: boolean;
}

export default function FrequencySelector({
  frequency,
  checkDay,
  onChange,
  compact = false,
}: FrequencySelectorProps) {
  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-2"}>
      <select
        value={frequency}
        onChange={(e) => {
          const freq = e.target.value as CheckFrequency;
          const defaultDay = freq === "weekly" ? 5 : freq === "monthly" ? 1 : null;
          onChange(freq, defaultDay);
        }}
        className={`border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
          compact ? "w-auto" : "w-full"
        }`}
      >
        <option value="manual">Manual</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>

      {frequency === "weekly" && (
        <select
          value={checkDay ?? 5}
          onChange={(e) => onChange(frequency, parseInt(e.target.value))}
          className={`border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
            compact ? "w-auto" : "w-full"
          }`}
        >
          {DAYS_OF_WEEK.map((day, i) => (
            <option key={i} value={i}>{day}</option>
          ))}
        </select>
      )}

      {frequency === "monthly" && (
        <select
          value={checkDay ?? 1}
          onChange={(e) => onChange(frequency, parseInt(e.target.value))}
          className={`border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
            compact ? "w-auto" : "w-full"
          }`}
        >
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{ordinal(d)}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
