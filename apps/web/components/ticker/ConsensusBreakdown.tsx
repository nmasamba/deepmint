"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface ConsensusBreakdownProps {
  longCount: number;
  shortCount: number;
  neutralCount: number;
  weightedBullish: number;
  weightedBearish: number;
  weightedNeutral: number;
  avgTargetPriceCents: number | null;
  currentPriceCents: number;
  targetDispersionBps: number | null;
  activeClaims: number;
}

const COLORS = {
  bullish: "#22C55E",
  bearish: "#EF4444",
  neutral: "#64748B",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

export function ConsensusBreakdown({
  longCount,
  shortCount,
  neutralCount,
  weightedBullish,
  weightedBearish,
  weightedNeutral,
  avgTargetPriceCents,
  currentPriceCents,
  targetDispersionBps,
  activeClaims,
}: ConsensusBreakdownProps) {
  const totalWeighted = weightedBullish + weightedBearish + weightedNeutral;
  const bullishPct =
    totalWeighted > 0 ? Math.round((weightedBullish / totalWeighted) * 100) : 0;
  const bearishPct =
    totalWeighted > 0 ? Math.round((weightedBearish / totalWeighted) * 100) : 0;
  const neutralPct = 100 - bullishPct - bearishPct;

  const pieData = [
    { name: "Bullish", value: weightedBullish || 0.01 },
    { name: "Bearish", value: weightedBearish || 0.01 },
    { name: "Neutral", value: weightedNeutral || 0.01 },
  ];

  const colorArr = [COLORS.bullish, COLORS.bearish, COLORS.neutral];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {/* Donut chart */}
      <div className="flex flex-col items-center justify-center">
        <div className="relative h-48 w-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((_, index) => (
                  <Cell key={index} fill={colorArr[index]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-xl font-bold text-text-primary">
              {activeClaims}
            </span>
            <span className="text-xs text-text-secondary">claims</span>
          </div>
        </div>

        {/* Weighted percentages */}
        <div className="mt-4 flex gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS.bullish }} />
            <span className="text-text-secondary">{bullishPct}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS.bearish }} />
            <span className="text-text-secondary">{bearishPct}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS.neutral }} />
            <span className="text-text-secondary">{neutralPct}%</span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="space-y-4">
        {/* Raw counts */}
        <div className="rounded-lg border border-border bg-bg-primary p-3">
          <p className="mb-2 text-xs font-medium uppercase text-text-secondary">
            Raw Counts
          </p>
          <div className="flex gap-4">
            <div>
              <span className="font-mono text-lg font-bold text-green-500">
                {longCount}
              </span>
              <span className="ml-1 text-xs text-text-secondary">Long</span>
            </div>
            <div>
              <span className="font-mono text-lg font-bold text-red-500">
                {shortCount}
              </span>
              <span className="ml-1 text-xs text-text-secondary">Short</span>
            </div>
            <div>
              <span className="font-mono text-lg font-bold text-gray-400">
                {neutralCount}
              </span>
              <span className="ml-1 text-xs text-text-secondary">Neutral</span>
            </div>
          </div>
        </div>

        {/* Average target vs current */}
        {avgTargetPriceCents && (
          <div className="rounded-lg border border-border bg-bg-primary p-3">
            <p className="mb-2 text-xs font-medium uppercase text-text-secondary">
              Avg Target vs Current
            </p>
            <div className="flex items-baseline gap-3">
              <div>
                <span className="font-mono text-lg font-bold text-accent">
                  {formatCents(avgTargetPriceCents)}
                </span>
                <span className="ml-1 text-xs text-text-secondary">target</span>
              </div>
              <span className="text-text-secondary/40">/</span>
              <div>
                <span className="font-mono text-lg font-bold text-text-primary">
                  {formatCents(currentPriceCents)}
                </span>
                <span className="ml-1 text-xs text-text-secondary">current</span>
              </div>
            </div>
          </div>
        )}

        {/* Dispersion */}
        {targetDispersionBps != null && (
          <div className="rounded-lg border border-border bg-bg-primary p-3">
            <p className="mb-1 text-xs font-medium uppercase text-text-secondary">
              Target Dispersion
            </p>
            <span className="font-mono text-lg font-bold text-text-primary">
              {formatBps(targetDispersionBps)}
            </span>
            <span className="ml-1 text-xs text-text-secondary">
              std dev of targets
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
