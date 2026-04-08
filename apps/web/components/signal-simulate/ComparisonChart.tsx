"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

interface PerformanceData {
  portfolioId: string;
  portfolioName: string;
  startingBalanceCents: number;
  availableCashCents: number;
  openPositionValueCents: number;
  totalEquityCents: number;
  realizedPnlCents: number;
  unrealizedPnlCents: number;
  totalReturnBps: number;
  openTradeCount: number;
  closedTradeCount: number;
}

interface ComparisonChartProps {
  signal: PerformanceData | null;
  own: PerformanceData | null;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatBps(bps: number): string {
  const sign = bps >= 0 ? "+" : "";
  return `${sign}${(bps / 100).toFixed(2)}%`;
}

export function ComparisonChart({ signal, own }: ComparisonChartProps) {
  if (!signal) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center">
        <p className="text-text-secondary">No signal data available yet.</p>
      </div>
    );
  }

  const chartData = [
    {
      name: "Total Return",
      Signal: signal.totalReturnBps / 100,
      ...(own ? { "Your Portfolio": own.totalReturnBps / 100 } : {}),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat comparison cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Signal portfolio */}
        <div className="rounded-lg border border-accent/20 bg-bg-secondary p-4">
          <h3 className="text-sm font-medium text-accent">
            {signal.portfolioName}
          </h3>
          <div className="mt-3 space-y-2">
            <StatRow label="Total Equity" value={formatCents(signal.totalEquityCents)} />
            <StatRow label="Realized P&L" value={formatCents(signal.realizedPnlCents)} highlight={signal.realizedPnlCents} />
            <StatRow label="Unrealized P&L" value={formatCents(signal.unrealizedPnlCents)} highlight={signal.unrealizedPnlCents} />
            <StatRow label="Total Return" value={formatBps(signal.totalReturnBps)} highlight={signal.totalReturnBps} />
            <StatRow label="Open / Closed" value={`${signal.openTradeCount} / ${signal.closedTradeCount}`} />
          </div>
        </div>

        {/* Own portfolio */}
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h3 className="text-sm font-medium text-text-primary">
            {own ? own.portfolioName : "Your Portfolio"}
          </h3>
          {own ? (
            <div className="mt-3 space-y-2">
              <StatRow label="Total Equity" value={formatCents(own.totalEquityCents)} />
              <StatRow label="Realized P&L" value={formatCents(own.realizedPnlCents)} highlight={own.realizedPnlCents} />
              <StatRow label="Unrealized P&L" value={formatCents(own.unrealizedPnlCents)} highlight={own.unrealizedPnlCents} />
              <StatRow label="Total Return" value={formatBps(own.totalReturnBps)} highlight={own.totalReturnBps} />
              <StatRow label="Open / Closed" value={`${own.openTradeCount} / ${own.closedTradeCount}`} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-muted">
              Create a paper portfolio to compare your performance.
            </p>
          )}
        </div>
      </div>

      {/* Bar chart comparison */}
      {own && (
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h3 className="mb-4 text-sm font-medium text-text-primary">
            Return Comparison (%)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2332" />
              <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 12 }} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111827",
                  border: "1px solid #1A2332",
                  borderRadius: 8,
                  color: "#E2E8F0",
                }}
              />
              <Legend />
              <Bar dataKey="Signal" fill="#2DD4BF" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Your Portfolio" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: number;
}) {
  let valueColor = "text-text-primary";
  if (highlight !== undefined) {
    valueColor = highlight > 0 ? "text-green-400" : highlight < 0 ? "text-red-400" : "text-text-primary";
  }

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={`font-mono font-medium ${valueColor}`}>{value}</span>
    </div>
  );
}
