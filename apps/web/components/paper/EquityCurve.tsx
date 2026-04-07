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
}

export function EquityCurve({
  startingBalance,
  currentEquity,
}: EquityCurveProps) {
  // Simple 2-point chart for now (starting → current)
  // A full equity curve would require historical daily snapshots
  const data = [
    { label: "Start", value: startingBalance / 100 },
    { label: "Now", value: currentEquity / 100 },
  ];

  const isPositive = currentEquity >= startingBalance;

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <p className="mb-3 text-xs font-medium uppercase text-text-secondary">
        Equity Curve
      </p>
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
              dot={{ fill: isPositive ? "#22C55E" : "#EF4444", r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
