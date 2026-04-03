"use client";

interface HistoryEntry {
  source_id: number;
  retailer: string;
  price: number;
  checked_at: string;
}

interface PriceChartProps {
  history: HistoryEntry[];
  currency: string;
  desiredPrice: number | null;
}

// Color palette for different sources
const COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

export default function PriceChart({ history, currency, desiredPrice }: PriceChartProps) {
  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        No price history yet. Refresh prices to start tracking.
      </div>
    );
  }

  // Group by source
  const sourceMap = new Map<number, { retailer: string; points: { price: number; date: string }[] }>();
  for (const entry of history) {
    if (!sourceMap.has(entry.source_id)) {
      sourceMap.set(entry.source_id, { retailer: entry.retailer, points: [] });
    }
    sourceMap.get(entry.source_id)!.points.push({
      price: entry.price,
      date: entry.checked_at,
    });
  }

  const sources = Array.from(sourceMap.entries());

  // Get global min/max for scaling
  const allPrices = history.map((h) => h.price);
  if (desiredPrice != null) allPrices.push(desiredPrice);
  let min = Math.min(...allPrices);
  let max = Math.max(...allPrices);
  const padding = (max - min) * 0.1 || 5;
  min -= padding;
  max += padding;
  const range = max - min || 1;

  // SQLite datetimes are "YYYY-MM-DD HH:MM:SS" — replace space with T for reliable parsing
  function parseDate(d: string): number {
    const t = new Date(d.replace(" ", "T") + "Z").getTime();
    return isNaN(t) ? Date.now() : t;
  }

  // Get time range — pad by 1 hour if all points share the same timestamp
  const allDates = history.map((h) => parseDate(h.checked_at));
  const validDates = allDates.filter((d) => !isNaN(d));
  const minTime = validDates.length > 0 ? Math.min(...validDates) : Date.now();
  const maxTime = validDates.length > 0 ? Math.max(...validDates) : Date.now();
  const timeRange = maxTime - minTime || 3600000; // fallback 1 hour

  const width = 800;
  const height = 280;
  const chartPad = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartW = width - chartPad.left - chartPad.right;
  const chartH = height - chartPad.top - chartPad.bottom;

  function toX(date: string) {
    const t = parseDate(date);
    if (timeRange <= 3600000 && maxTime === minTime) return chartPad.left + chartW / 2;
    return chartPad.left + ((t - minTime) / timeRange) * chartW;
  }

  function toY(price: number) {
    return chartPad.top + chartH - ((price - min) / range) * chartH;
  }

  // Y-axis labels
  const yTicks = 5;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = min + (range * i) / yTicks;
    return { val, y: toY(val) };
  });

  // X-axis labels
  const uniqueDates = [...new Set(history.map((h) => h.checked_at.split(/[T ]/)[0]))].sort();
  const xLabels = uniqueDates.length <= 8
    ? uniqueDates
    : uniqueDates.filter((_, i) => i % Math.ceil(uniqueDates.length / 6) === 0);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Grid lines */}
        {yLabels.map(({ val, y }) => (
          <g key={val}>
            <line x1={chartPad.left} y1={y} x2={width - chartPad.right} y2={y} stroke="#e5e7eb" strokeWidth={1} />
            <text x={chartPad.left - 8} y={y + 4} textAnchor="end" fontSize={10} fill="#9ca3af">
              {val.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Desired price line */}
        {desiredPrice != null && (
          <g>
            <line
              x1={chartPad.left}
              y1={toY(desiredPrice)}
              x2={width - chartPad.right}
              y2={toY(desiredPrice)}
              stroke="#10b981"
              strokeWidth={1.5}
              strokeDasharray="6,4"
            />
            <text
              x={width - chartPad.right + 4}
              y={toY(desiredPrice) + 4}
              fontSize={10}
              fill="#10b981"
              fontWeight="bold"
            >
              Target
            </text>
          </g>
        )}

        {/* X-axis labels */}
        {xLabels.map((date) => {
          const x = toX(date + "T12:00:00");
          return (
            <text key={date} x={x} y={height - 8} textAnchor="middle" fontSize={10} fill="#9ca3af">
              {new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </text>
          );
        })}

        {/* Source lines */}
        {sources.map(([sourceId, { points }], idx) => {
          if (points.length < 1) return null;
          const color = COLORS[idx % COLORS.length];

          const pathD = points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.date)} ${toY(p.price)}`)
            .join(" ");

          return (
            <g key={sourceId}>
              <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {points.map((p, i) => (
                <circle key={i} cx={toX(p.date)} cy={toY(p.price)} r={3} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 px-1">
        {sources.map(([sourceId, { retailer }], idx) => (
          <div key={sourceId} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
            />
            {retailer}
          </div>
        ))}
      </div>
    </div>
  );
}
