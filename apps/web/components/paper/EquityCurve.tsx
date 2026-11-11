"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface EquityCurveProps {
  startingBalance: number;
  currentEquity: number;
  /** Equity at each session's close since the portfolio opened (cents). */
  history?: Array<{ date: string; equityCents: number }>;
}

/**
 * The portfolio's value from its start, through each day's close (the daily
 * paper-equity-snapshot job), to now.
 */
export function EquityCurve({
  startingBalance,
  currentEquity,
  history = [],
}: EquityCurveProps) {
  const data = [
    { label: "Start", value: startingBalance / 100 },
    ...history.map((p) => ({ label: p.date.slice(5), value: p.equityCents / 100 })),
    { label: "Now", value: currentEquity / 100 },
  ];

  const isPositive = currentEquity >= startingBalance;

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <p className="mb-3 text-xs font-medium uppercase text-text-secondary">
        Equity Curve
      </p>
      {history.length === 0 && (
        <p className="mb-2 text-xs text-text-secondary">
          A point is added the morning after each trading day.
        </p>
      )}
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              domain={["dataMin - 1000", "dataMax + 1000"]}
            />
            <Tooltip
              contentStyle={{
                background: "#1A2332",
                border: "1px solid #374151",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#E2E8F0",
              }}
              formatter={(value) =>
                `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
              }
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={isPositive ? "#22C55E" : "#EF4444"}
              strokeWidth={2}
              dot={
                data.length <= 30
                  ? { fill: isPositive ? "#22C55E" : "#EF4444", r: 3 }
                  : false
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
