"use client";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { NewTradeForm } from "./NewTradeForm";
import { EquityCurve } from "./EquityCurve";

interface PortfolioDetailProps {
  portfolioId: string;
}

function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  return `$${(abs / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedCents(cents: number): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "-" : "";
  return `${sign}${formatCents(cents)}`;
}

export function PortfolioDetail({ portfolioId }: PortfolioDetailProps) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.paper.portfolioDetail.useQuery({
    portfolioId,
  });
  const { data: perf } = trpc.paper.portfolioPerformance.useQuery({
    portfolioId,
  });

  const closeMutation = trpc.paper.closeTrade.useMutation({
    onSuccess: () => {
      utils.paper.portfolioDetail.invalidate({ portfolioId });
      utils.paper.portfolioPerformance.invalidate({ portfolioId });
      utils.paper.myPortfolios.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!data) return null;

  interface TradeRow {
    trade: {
      id: string;
      side: "buy" | "sell";
      entryPriceCents: number;
      exitPriceCents: number | null;
      quantity: string;
      openedAt: string | Date;
      closedAt: string | Date | null;
    };
    instrument: {
      id: string;
      ticker: string;
      name: string;
    };
  }

  const openTrades = (data.trades as TradeRow[]).filter(
    (t) => t.trade.closedAt === null,
  );
  const closedTrades = (data.trades as TradeRow[]).filter(
    (t) => t.trade.closedAt !== null,
  );

  return (
    <div className="space-y-6">
      {/* Performance summary */}
      {perf && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Total Equity"
            value={formatCents(perf.totalEquityCents)}
          />
          <StatCard
            label="Available Cash"
            value={formatCents(perf.availableCashCents)}
          />
          <StatCard
            label="Total Return"
            value={`${perf.totalReturnBps >= 0 ? "+" : ""}${(perf.totalReturnBps / 100).toFixed(2)}%`}
            color={perf.totalReturnBps >= 0 ? "text-green-500" : "text-red-500"}
          />
          <StatCard
            label="Unrealized P&L"
            value={formatSignedCents(perf.unrealizedPnlCents)}
            color={
              perf.unrealizedPnlCents >= 0 ? "text-green-500" : "text-red-500"
            }
          />
        </div>
      )}

      {/* Equity curve placeholder */}
      {perf && (
        <EquityCurve
          startingBalance={perf.startingBalanceCents}
          currentEquity={perf.totalEquityCents}
        />
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">Positions</h3>
        <NewTradeForm portfolioId={portfolioId} />
      </div>

      {/* Open trades */}
      {openTrades.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-text-secondary">
            Open ({openTrades.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-text-secondary">
                  <th className="pb-2 pr-4">Ticker</th>
                  <th className="pb-2 pr-4">Side</th>
                  <th className="pb-2 pr-4 text-right">Qty</th>
                  <th className="pb-2 pr-4 text-right">Entry</th>
                  <th className="pb-2 pr-4 text-right">Opened</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {openTrades.map((t) => (
                  <tr key={t.trade.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono font-bold text-text-primary">
                      {t.instrument.ticker}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          t.trade.side === "buy"
                            ? "text-green-500"
                            : "text-red-500"
                        }
                      >
                        {t.trade.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-text-primary">
                      {Number(t.trade.quantity).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-text-primary">
                      {formatCents(t.trade.entryPriceCents)}
                    </td>
                    <td className="py-2 pr-4 text-right text-text-secondary">
                      {new Date(t.trade.openedAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={closeMutation.isPending}
                        onClick={() =>
                          closeMutation.mutate({ tradeId: t.trade.id })
                        }
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                      >
                        {closeMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Close"
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Closed trades */}
      {closedTrades.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-text-secondary">
            Closed ({closedTrades.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-text-secondary">
                  <th className="pb-2 pr-4">Ticker</th>
                  <th className="pb-2 pr-4">Side</th>
                  <th className="pb-2 pr-4 text-right">Qty</th>
                  <th className="pb-2 pr-4 text-right">Entry</th>
                  <th className="pb-2 pr-4 text-right">Exit</th>
                  <th className="pb-2 text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.map((t) => {
                  const qty = Number(t.trade.quantity);
                  const entry = t.trade.entryPriceCents;
                  const exit = t.trade.exitPriceCents ?? 0;
                  const pnl =
                    t.trade.side === "buy"
                      ? Math.round((exit - entry) * qty)
                      : Math.round((entry - exit) * qty);

                  return (
                    <tr
                      key={t.trade.id}
                      className="border-b border-border/50"
                    >
                      <td className="py-2 pr-4 font-mono font-bold text-text-primary">
                        {t.instrument.ticker}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={
                            t.trade.side === "buy"
                              ? "text-green-500"
                              : "text-red-500"
                          }
                        >
                          {t.trade.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-text-primary">
                        {qty.toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-text-primary">
                        {formatCents(entry)}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-text-primary">
                        {formatCents(exit)}
                      </td>
                      <td
                        className={`py-2 text-right font-mono font-bold ${
                          pnl >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {formatSignedCents(pnl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {openTrades.length === 0 && closedTrades.length === 0 && (
        <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center">
          <p className="text-text-secondary">No trades yet.</p>
          <p className="mt-1 text-sm text-text-secondary/60">
            Use the &quot;New Trade&quot; button to place your first paper trade.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-3">
      <p className="text-xs font-medium uppercase text-text-secondary">
        {label}
      </p>
      <p className={`mt-1 font-mono text-lg font-bold ${color ?? "text-text-primary"}`}>
        {value}
      </p>
    </div>
  );
}
