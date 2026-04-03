"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

interface TrustCategory {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

interface TrustFactor {
  factor: string;
  impact: "positive" | "negative" | "neutral";
  severity: number;
  detail: string;
}

interface TrustData {
  domain: string;
  retailer: string;
  score: number;
  summary: string;
  categories: TrustCategory[];
  factors: TrustFactor[];
  checked_at: string;
}

export default function TrustOverviewPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = use(params);
  const [data, setData] = useState<TrustData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/trust/${domain}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [domain]);

  if (loading) return <div className="text-center text-gray-400 py-20">Loading...</div>;

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 mb-2">No trust data found for this retailer.</p>
        <p className="text-xs text-gray-300 mb-4">{domain}</p>
        <Link href="/" className="text-emerald-600 hover:underline text-sm">Back to dashboard</Link>
      </div>
    );
  }

  const scoreColor = data.score >= 70 ? "#10b981" : data.score >= 50 ? "#f59e0b" : "#ef4444";
  const negativeFactors = data.factors.filter((f) => f.impact === "negative").sort((a, b) => b.severity - a.severity);
  const positiveFactors = data.factors.filter((f) => f.impact === "positive").sort((a, b) => b.severity - a.severity);
  const neutralFactors = data.factors.filter((f) => f.impact === "neutral");

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 transition">
        &larr; Back to dashboard
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">{data.retailer}</h1>
          <p className="text-sm text-gray-500">{data.domain}</p>
        </div>
      </div>

      {/* Overall score donut + summary */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center gap-8">
          <DonutGauge score={data.score} size={160} color={scoreColor} />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Trust Score</h2>
            <p className="text-3xl font-bold" style={{ color: scoreColor }}>{data.score}<span className="text-lg text-gray-400">/100</span></p>
            <p className="text-sm text-gray-600 mt-2">{data.summary}</p>
            <p className="text-xs text-gray-400 mt-2">
              Last evaluated: {new Date(data.checked_at.replace(" ", "T") + "Z").toLocaleString("en-GB", {
                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Category gauges */}
      {data.categories.length > 0 && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Score Breakdown</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.categories.map((cat) => (
              <CategoryGauge key={cat.name} category={cat} />
            ))}
          </div>
        </div>
      )}

      {/* Negative factors — biggest impact first */}
      {negativeFactors.length > 0 && (
        <div className="bg-white border rounded-lg">
          <div className="px-6 py-4 border-b">
            <h2 className="text-sm font-semibold text-gray-700">Improvement Areas</h2>
            <p className="text-xs text-gray-400 mt-0.5">Factors reducing the trust score, ranked by impact</p>
          </div>
          <div className="divide-y">
            {negativeFactors.map((f, i) => (
              <div key={i} className="px-6 py-3 flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <ImpactBar severity={f.severity} impact="negative" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{f.factor}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{f.detail}</p>
                </div>
                <span className="text-xs text-red-500 font-medium flex-shrink-0">-{f.severity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Positive factors */}
      {positiveFactors.length > 0 && (
        <div className="bg-white border rounded-lg">
          <div className="px-6 py-4 border-b">
            <h2 className="text-sm font-semibold text-gray-700">Strengths</h2>
          </div>
          <div className="divide-y">
            {positiveFactors.map((f, i) => (
              <div key={i} className="px-6 py-3 flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <ImpactBar severity={f.severity} impact="positive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{f.factor}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{f.detail}</p>
                </div>
                <span className="text-xs text-emerald-500 font-medium flex-shrink-0">+{f.severity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Neutral factors */}
      {neutralFactors.length > 0 && (
        <div className="bg-white border rounded-lg">
          <div className="px-6 py-4 border-b">
            <h2 className="text-sm font-semibold text-gray-700">Other Observations</h2>
          </div>
          <div className="divide-y">
            {neutralFactors.map((f, i) => (
              <div key={i} className="px-6 py-3 flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <ImpactBar severity={f.severity} impact="neutral" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{f.factor}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{f.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Donut Gauge ─── */
function DonutGauge({ score, size, color }: { score: number; size: number; color: string }) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const center = size / 2;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="#e5e7eb" strokeWidth={stroke}
        />
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-gray-400">out of 100</span>
      </div>
    </div>
  );
}

/* ─── Category Gauge (semicircle) ─── */
function CategoryGauge({ category }: { category: TrustCategory }) {
  const color = category.score >= 70 ? "#10b981" : category.score >= 50 ? "#f59e0b" : "#ef4444";
  const size = 100;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const semicircle = Math.PI * radius;
  const progress = (category.score / 100) * semicircle;

  return (
    <div className="text-center">
      <div className="relative inline-block" style={{ width: size, height: size / 2 + 10 }}>
        <svg width={size} height={size / 2 + 5} className="overflow-visible">
          <path
            d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
            fill="none" stroke="#e5e7eb" strokeWidth={stroke} strokeLinecap="round"
          />
          <path
            d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
            fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={semicircle}
            strokeDashoffset={semicircle - progress}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute bottom-0 left-0 right-0 text-center">
          <span className="text-lg font-bold" style={{ color }}>{category.score}</span>
        </div>
      </div>
      <p className="text-xs font-medium text-gray-700 mt-1">{category.name}</p>
      <p className="text-xs text-gray-400">{category.weight}% weight</p>
      <p className="text-xs text-gray-500 mt-1">{category.detail}</p>
    </div>
  );
}

/* ─── Impact severity bar ─── */
function ImpactBar({ severity, impact }: { severity: number; impact: string }) {
  const color = impact === "negative" ? "bg-red-500" : impact === "positive" ? "bg-emerald-500" : "bg-gray-400";
  const width = (severity / 10) * 100;

  return (
    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}
