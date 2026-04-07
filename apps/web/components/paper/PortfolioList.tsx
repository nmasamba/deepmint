"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Briefcase } from "lucide-react";

interface PortfolioListProps {
  onSelect: (portfolioId: string) => void;
  selectedId: string | null;
}

function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const sign = cents < 0 ? "-" : cents > 0 ? "+" : "";
  return `${sign}$${(abs / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PortfolioList({ onSelect, selectedId }: PortfolioListProps) {
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();

  const { data: portfolios, isLoading } = trpc.paper.myPortfolios.useQuery();

  const createMutation = trpc.paper.createPortfolio.useMutation({
    onSuccess: (portfolio) => {
      utils.paper.myPortfolios.invalidate();
      setNewName("");
      setShowCreate(false);
      onSelect(portfolio.id);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {portfolios && portfolios.length > 0 ? (
        portfolios.map((p: { id: string; name: string; startingBalanceCents: number; openTradeCount: number; closedTradeCount: number; realizedPnlCents: number }) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`w-full rounded-lg border p-4 text-left transition-colors ${
              selectedId === p.id
                ? "border-accent bg-accent/5"
                : "border-border bg-bg-secondary hover:border-border-hover"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-text-secondary" />
                <span className="font-medium text-text-primary">{p.name}</span>
              </div>
              <span className="text-xs text-text-secondary">
                {p.openTradeCount} open
              </span>
            </div>
            <div className="mt-2 flex items-center gap-4 text-sm">
              <span className="text-text-secondary">
                Starting: ${(p.startingBalanceCents / 100).toLocaleString()}
              </span>
              <span
                className={
                  p.realizedPnlCents >= 0 ? "text-green-500" : "text-red-500"
                }
              >
                Realized: {formatCents(p.realizedPnlCents)}
              </span>
            </div>
          </button>
        ))
      ) : (
        <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-text-secondary/40" />
          <p className="mt-3 text-text-secondary">No portfolios yet.</p>
          <p className="mt-1 text-sm text-text-secondary/60">
            Create your first paper portfolio to start practicing.
          </p>
        </div>
      )}

      {showCreate ? (
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Portfolio name..."
            className="bg-bg-secondary"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                createMutation.mutate({ name: newName.trim() });
              }
            }}
          />
          <Button
            onClick={() =>
              newName.trim() &&
              createMutation.mutate({ name: newName.trim() })
            }
            disabled={!newName.trim() || createMutation.isPending}
            className="bg-accent text-bg-primary hover:bg-accent/90"
          >
            Create
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowCreate(false);
              setNewName("");
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full border-dashed border-border text-text-secondary hover:border-accent hover:text-accent"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Portfolio
        </Button>
      )}
    </div>
  );
}
