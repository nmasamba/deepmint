"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EntityProfileTabsProps {
  entityType: "player" | "guide";
}

export function EntityProfileTabs({ entityType }: EntityProfileTabsProps) {
  return (
    <Tabs defaultValue="overview" className="mt-8">
      <TabsList className="bg-bg-secondary border border-border">
        <TabsTrigger
          value="overview"
          className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-accent"
        >
          Overview
        </TabsTrigger>
        <TabsTrigger
          value="claims"
          className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-accent"
        >
          Claims
        </TabsTrigger>
        <TabsTrigger
          value="stats"
          className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-accent"
        >
          Stats
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <p className="text-text-secondary">
            {entityType === "guide"
              ? "Performance data will appear here after scoring is live. Track record metrics, equity curves, and recent calls."
              : "Trading performance, risk metrics, and portfolio analytics will appear here."}
          </p>
        </div>
      </TabsContent>

      <TabsContent value="claims" className="mt-6">
        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <p className="text-text-secondary">
            Immutable claim history will appear here. Every prediction timestamped and tracked.
          </p>
        </div>
      </TabsContent>

      <TabsContent value="stats" className="mt-6">
        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <p className="text-text-secondary">
            {entityType === "guide"
              ? "Detailed metrics: hit rate by horizon, calibration charts, regime performance, and EIV scores."
              : "Detailed metrics: Sharpe ratio, Calmar, CVaR, max drawdown, consistency, and trade analysis."}
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );
}
