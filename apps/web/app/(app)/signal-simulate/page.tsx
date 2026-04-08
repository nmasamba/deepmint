"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { SignalSimulateCard } from "@/components/signal-simulate/SignalSimulateCard";
import { ComparisonChart } from "@/components/signal-simulate/ComparisonChart";
import { Copy } from "lucide-react";

export default function SignalSimulatePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: sims, isLoading } = trpc.signalSimulate.list.useQuery();

  const { data: comparison } = trpc.signalSimulate.comparison.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Signal Simulate
        </h1>
        <p className="mt-1 text-text-secondary">
          Mirror a Guide or Player's signals as paper trades. Compare their
          performance against yours.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        {/* Sim list */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-bg-tertiary"
                />
              ))}
            </div>
          ) : sims && sims.length > 0 ? (
            sims.map((sim) => (
              <SignalSimulateCard
                key={sim.id}
                sim={sim}
                isSelected={selectedId === sim.id}
                onSelect={setSelectedId}
              />
            ))
          ) : (
            <div className="rounded-lg border border-border bg-bg-secondary p-6 text-center">
              <Copy className="mx-auto h-8 w-8 text-text-muted" />
              <p className="mt-2 text-sm text-text-secondary">
                No signal portfolios yet.
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Visit a Guide or Player profile and click "Mirror Signals" to
                start tracking their performance.
              </p>
            </div>
          )}
        </div>

        {/* Comparison detail */}
        <div>
          {selectedId && comparison ? (
            <ComparisonChart
              signal={comparison.signal}
              own={comparison.own}
            />
          ) : (
            <div className="rounded-lg border border-border bg-bg-secondary p-12 text-center">
              <p className="text-text-secondary">
                {sims && sims.length > 0
                  ? "Select a signal portfolio to view performance comparison."
                  : "Mirror a Guide or Player to see side-by-side performance."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
