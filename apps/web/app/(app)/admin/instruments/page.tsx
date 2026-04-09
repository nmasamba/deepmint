"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SP500_TOP_50_EXPANSION } from "@deepmint/db/seed/sp500-top50";
import { toast } from "sonner";
import { Check, X, Power, Plus, ListChecks } from "lucide-react";

type Tab = "instruments" | "requests";

export default function AdminInstrumentsPage() {
  const [tab, setTab] = useState<Tab>("instruments");
  const utils = trpc.useUtils();

  const { data: instruments, isLoading: instrumentsLoading } =
    trpc.instruments.adminList.useQuery({ includeInactive: true, limit: 100 });

  const { data: requests, isLoading: requestsLoading } =
    trpc.instruments.listRequests.useQuery(
      { limit: 100 },
      { enabled: tab === "requests" },
    );

  const batchCreateMutation = trpc.instruments.adminBatchCreate.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Seeded ${result.createdCount} instruments` +
          (result.skippedCount > 0
            ? ` (${result.skippedCount} skipped as duplicates)`
            : ""),
      );
      utils.instruments.adminList.invalidate();
    },
    onError: (err) => toast.error("Batch create failed", { description: err.message }),
  });

  const toggleMutation = trpc.instruments.adminToggleActive.useMutation({
    onSuccess: () => {
      utils.instruments.adminList.invalidate();
    },
    onError: (err) => toast.error("Toggle failed", { description: err.message }),
  });

  const reviewMutation = trpc.instruments.reviewRequest.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.status === "approved" ? "Request approved" : "Request rejected",
      );
      utils.instruments.listRequests.invalidate();
    },
    onError: (err) => toast.error("Review failed", { description: err.message }),
  });

  const handleSeedSP500 = () => {
    batchCreateMutation.mutate({
      instruments: SP500_TOP_50_EXPANSION.map((i) => ({
        ticker: i.ticker,
        name: i.name,
        assetClass: "equity" as const,
        exchange: i.exchange,
        sector: i.sector,
        industry: i.industry,
        marketCapBucket: i.marketCapBucket,
      })),
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Instruments</h1>
          <p className="mt-1 text-text-secondary">
            Manage tracked instruments and user ticker requests.
          </p>
        </div>
        <Button
          onClick={handleSeedSP500}
          disabled={batchCreateMutation.isPending}
          className="bg-accent text-bg-primary hover:bg-accent-hover"
        >
          <Plus className="mr-1 h-4 w-4" />
          {batchCreateMutation.isPending
            ? "Seeding..."
            : `Seed S&P 500 Top ${SP500_TOP_50_EXPANSION.length}`}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab("instruments")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "instruments"
              ? "border-b-2 border-accent text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Instruments
        </button>
        <button
          onClick={() => setTab("requests")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "requests"
              ? "border-b-2 border-accent text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <ListChecks className="mr-1 inline h-4 w-4" />
          User Requests
        </button>
      </div>

      {tab === "instruments" && (
        <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden">
          {instrumentsLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-bg-tertiary text-left text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Ticker</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Exchange</th>
                  <th className="px-4 py-3 font-medium">Sector</th>
                  <th className="px-4 py-3 font-medium">Cap</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(instruments?.items ?? []).map((i) => (
                  <tr key={i.id} className="hover:bg-bg-tertiary/50">
                    <td className="px-4 py-3 font-mono font-semibold text-accent">
                      {i.ticker}
                    </td>
                    <td className="px-4 py-3 text-text-primary">{i.name}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {i.exchange ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {i.sector ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {i.marketCapBucket ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={
                          i.isActive
                            ? "border-green-500/30 text-green-500"
                            : "border-red-500/30 text-red-500"
                        }
                      >
                        {i.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          toggleMutation.mutate({
                            id: i.id,
                            isActive: !i.isActive,
                          })
                        }
                        disabled={toggleMutation.isPending}
                        className="border-border text-text-secondary hover:text-text-primary"
                      >
                        <Power className="mr-1 h-3 w-3" />
                        {i.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {(instruments?.items ?? []).length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-text-secondary"
                    >
                      No instruments yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "requests" && (
        <div className="rounded-lg border border-border bg-bg-secondary">
          {requestsLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : (requests ?? []).length === 0 ? (
            <div className="p-8 text-center text-text-secondary">
              No ticker requests.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(requests ?? []).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-accent">
                        {r.ticker}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          r.status === "pending"
                            ? "border-amber-500/30 text-amber-500"
                            : r.status === "approved"
                              ? "border-green-500/30 text-green-500"
                              : "border-red-500/30 text-red-500"
                        }
                      >
                        {r.status}
                      </Badge>
                    </div>
                    {r.reason && (
                      <p className="mt-1 text-sm text-text-secondary">
                        {r.reason}
                      </p>
                    )}
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          reviewMutation.mutate({
                            id: r.id,
                            status: "approved",
                          })
                        }
                        disabled={reviewMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Check className="mr-1 h-3 w-3" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          reviewMutation.mutate({
                            id: r.id,
                            status: "rejected",
                          })
                        }
                        disabled={reviewMutation.isPending}
                        className="border-red-500/30 text-red-500 hover:bg-red-500/10"
                      >
                        <X className="mr-1 h-3 w-3" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
