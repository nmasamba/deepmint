"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { InstrumentSearch } from "@/components/InstrumentSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Plus, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { VALID_HORIZONS, RATIONALE_TAGS } from "@deepmint/shared";
import { toast } from "sonner";

const HORIZON_LABELS: Record<number, string> = {
  1: "1D",
  7: "1W",
  30: "1M",
  90: "3M",
  180: "6M",
  365: "1Y",
};

const DIRECTION_CONFIG = {
  long: {
    label: "Long",
    icon: TrendingUp,
    activeClass: "bg-green-600 text-white border-green-600",
  },
  short: {
    label: "Short",
    icon: TrendingDown,
    activeClass: "bg-red-600 text-white border-red-600",
  },
  neutral: {
    label: "Neutral",
    icon: Minus,
    activeClass: "bg-gray-600 text-white border-gray-600",
  },
} as const;

interface SubmitClaimFormProps {
  trigger?: React.ReactNode;
}

export function SubmitClaimForm({ trigger }: SubmitClaimFormProps) {
  const [open, setOpen] = useState(false);
  const [instrumentId, setInstrumentId] = useState<string | null>(null);
  const [instrumentTicker, setInstrumentTicker] = useState<string>("");
  const [direction, setDirection] = useState<"long" | "short" | "neutral" | null>(null);
  const [horizonDays, setHorizonDays] = useState<number | null>(null);
  const [targetPrice, setTargetPrice] = useState<string>("");
  const [confidence, setConfidence] = useState<number[]>([50]);
  const [rationale, setRationale] = useState("");
  type RationaleTag = (typeof RATIONALE_TAGS)[number];
  const [selectedTags, setSelectedTags] = useState<RationaleTag[]>([]);

  const utils = trpc.useUtils();
  const submitMutation = trpc.claims.submit.useMutation({
    onSuccess: (claim) => {
      toast.success("Claim submitted!", {
        description: `${direction?.toUpperCase()} ${instrumentTicker} — ${HORIZON_LABELS[horizonDays ?? 0] ?? ""} horizon`,
      });
      resetForm();
      setOpen(false);
      utils.claims.list.invalidate();
    },
    onError: (error) => {
      toast.error("Failed to submit claim", {
        description: error.message,
      });
    },
  });

  function resetForm() {
    setInstrumentId(null);
    setInstrumentTicker("");
    setDirection(null);
    setHorizonDays(null);
    setTargetPrice("");
    setConfidence([50]);
    setRationale("");
    setSelectedTags([]);
  }

  function handleSubmit() {
    if (!instrumentId || !direction || !horizonDays) return;

    const targetPriceCents = targetPrice
      ? Math.round(parseFloat(targetPrice) * 100)
      : undefined;

    submitMutation.mutate({
      instrumentId,
      direction,
      horizonDays,
      targetPriceCents: targetPriceCents && targetPriceCents > 0 ? targetPriceCents : undefined,
      confidence: confidence[0],
      rationale: rationale.trim() || undefined,
      rationaleTags: selectedTags.length > 0 ? selectedTags : undefined,
    });
  }

  function toggleTag(tag: RationaleTag) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  const isValid = instrumentId && direction && horizonDays;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="bg-accent text-bg-primary hover:bg-accent/90">
            <Plus className="mr-1 h-4 w-4" />
            New Claim
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto border-border bg-bg-primary sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-text-primary">Submit a Claim</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Instrument Search */}
          <div className="space-y-2">
            <Label className="text-text-secondary">Instrument *</Label>
            <InstrumentSearch
              trigger="inline"
              onSelect={(instrument) => {
                setInstrumentId(instrument.id);
                setInstrumentTicker(instrument.ticker);
              }}
            />
            {instrumentTicker && (
              <Badge variant="outline" className="border-accent text-accent">
                {instrumentTicker}
              </Badge>
            )}
          </div>

          {/* Direction */}
          <div className="space-y-2">
            <Label className="text-text-secondary">Direction *</Label>
            <div className="flex gap-2">
              {(Object.keys(DIRECTION_CONFIG) as Array<keyof typeof DIRECTION_CONFIG>).map(
                (dir) => {
                  const config = DIRECTION_CONFIG[dir];
                  const Icon = config.icon;
                  const isActive = direction === dir;
                  return (
                    <Button
                      key={dir}
                      type="button"
                      variant="outline"
                      className={`flex-1 border-border ${
                        isActive ? config.activeClass : "text-text-secondary hover:text-text-primary"
                      }`}
                      onClick={() => setDirection(dir)}
                    >
                      <Icon className="mr-1 h-4 w-4" />
                      {config.label}
                    </Button>
                  );
                },
              )}
            </div>
          </div>

          {/* Horizon */}
          <div className="space-y-2">
            <Label className="text-text-secondary">Horizon *</Label>
            <div className="flex flex-wrap gap-2">
              {VALID_HORIZONS.map((h) => (
                <Button
                  key={h}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={`border-border ${
                    horizonDays === h
                      ? "bg-accent text-bg-primary border-accent"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                  onClick={() => setHorizonDays(h)}
                >
                  {HORIZON_LABELS[h]}
                </Button>
              ))}
            </div>
          </div>

          {/* Target Price (optional) */}
          <div className="space-y-2">
            <Label className="text-text-secondary">Target Price (optional)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
                $
              </span>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="border-border bg-bg-secondary pl-7 text-text-primary"
              />
            </div>
          </div>

          {/* Confidence */}
          <div className="space-y-2">
            <Label className="text-text-secondary">
              Confidence: <span className="font-mono text-accent">{confidence[0]}%</span>
            </Label>
            <Slider
              value={confidence}
              onValueChange={setConfidence}
              min={0}
              max={100}
              step={5}
              className="py-2"
            />
          </div>

          {/* Rationale */}
          <div className="space-y-2">
            <Label className="text-text-secondary">
              Rationale{" "}
              <span className="text-xs text-text-secondary/60">
                ({rationale.length}/5000)
              </span>
            </Label>
            <Textarea
              placeholder="Why are you making this call?"
              value={rationale}
              onChange={(e) => setRationale(e.target.value.slice(0, 5000))}
              className="min-h-[100px] border-border bg-bg-secondary text-text-primary"
            />
          </div>

          {/* Rationale Tags */}
          <div className="space-y-2">
            <Label className="text-text-secondary">Tags</Label>
            <div className="flex flex-wrap gap-2">
              {RATIONALE_TAGS.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className={`cursor-pointer capitalize ${
                    selectedTags.includes(tag)
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-text-secondary hover:text-text-primary"
                  }`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!isValid || submitMutation.isPending}
            className="w-full bg-accent text-bg-primary hover:bg-accent/90 disabled:opacity-50"
          >
            {submitMutation.isPending ? "Submitting..." : "Submit Claim"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
