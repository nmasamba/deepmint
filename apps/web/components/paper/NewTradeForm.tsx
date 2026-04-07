"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InstrumentSearch } from "@/components/InstrumentSearch";
import { Plus, Loader2 } from "lucide-react";

interface NewTradeFormProps {
  portfolioId: string;
}

export function NewTradeForm({ portfolioId }: NewTradeFormProps) {
  const [open, setOpen] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState<{
    id: string;
    ticker: string;
    name: string;
  } | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const utils = trpc.useUtils();

  const addTradeMutation = trpc.paper.addTrade.useMutation({
    onSuccess: () => {
      utils.paper.portfolioDetail.invalidate({ portfolioId });
      utils.paper.myPortfolios.invalidate();
      setOpen(false);
      resetForm();
    },
  });

  function resetForm() {
    setSelectedInstrument(null);
    setSide("buy");
    setQuantity("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-accent text-bg-primary hover:bg-accent/90">
          <Plus className="mr-2 h-4 w-4" />
          New Trade
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-bg-secondary border-border">
        <DialogHeader>
          <DialogTitle className="text-text-primary">New Paper Trade</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instrument search */}
          <div>
            <Label className="text-text-secondary">Instrument</Label>
            {selectedInstrument ? (
              <div className="mt-1 flex items-center justify-between rounded-md border border-border bg-bg-primary px-3 py-2">
                <div>
                  <span className="font-mono font-bold text-text-primary">
                    {selectedInstrument.ticker}
                  </span>
                  <span className="ml-2 text-sm text-text-secondary">
                    {selectedInstrument.name}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedInstrument(null)}
                  className="text-text-secondary"
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="mt-1">
                <InstrumentSearch
                  trigger="inline"
                  onSelect={(instrument) =>
                    setSelectedInstrument({
                      id: instrument.id,
                      ticker: instrument.ticker,
                      name: instrument.name,
                    })
                  }
                />
              </div>
            )}
          </div>

          {/* Side toggle */}
          <div>
            <Label className="text-text-secondary">Side</Label>
            <div className="mt-1 flex gap-2">
              <Button
                variant={side === "buy" ? "default" : "outline"}
                size="sm"
                onClick={() => setSide("buy")}
                className={
                  side === "buy"
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "border-border text-text-secondary"
                }
              >
                Buy
              </Button>
              <Button
                variant={side === "sell" ? "default" : "outline"}
                size="sm"
                onClick={() => setSide("sell")}
                className={
                  side === "sell"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "border-border text-text-secondary"
                }
              >
                Sell
              </Button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <Label className="text-text-secondary">Quantity (shares)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 10"
              className="mt-1 bg-bg-primary"
            />
          </div>

          {/* Error */}
          {addTradeMutation.error && (
            <p className="text-sm text-red-500">
              {addTradeMutation.error.message}
            </p>
          )}

          {/* Submit */}
          <Button
            onClick={() => {
              if (!selectedInstrument || !quantity) return;
              addTradeMutation.mutate({
                portfolioId,
                instrumentId: selectedInstrument.id,
                side,
                quantity,
              });
            }}
            disabled={
              !selectedInstrument ||
              !quantity ||
              Number(quantity) <= 0 ||
              addTradeMutation.isPending
            }
            className="w-full bg-accent text-bg-primary hover:bg-accent/90"
          >
            {addTradeMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Place {side === "buy" ? "Buy" : "Sell"} Order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
