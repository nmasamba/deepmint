"use client";

import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ConsensusSignalBadgeProps {
  direction: "bullish" | "bearish" | "neutral";
  convictionStrength: number; // 0-1
  size?: "sm" | "md";
}

const directionConfig = {
  bullish: {
    label: "BULLISH",
    icon: TrendingUp,
    className: "bg-green-500/10 text-green-500 border-green-500/30",
  },
  bearish: {
    label: "BEARISH",
    icon: TrendingDown,
    className: "bg-red-500/10 text-red-500 border-red-500/30",
  },
  neutral: {
    label: "NEUTRAL",
    icon: Minus,
    className: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  },
};

export function ConsensusSignalBadge({
  direction,
  convictionStrength,
  size = "md",
}: ConsensusSignalBadgeProps) {
  const config = directionConfig[direction];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant="outline"
        className={`${config.className} ${size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1"}`}
      >
        <Icon className={`${size === "sm" ? "h-3 w-3" : "h-4 w-4"} mr-1`} />
        {config.label}
      </Badge>
      {/* Conviction meter */}
      <div className="flex items-center gap-1">
        <div className="h-1.5 w-12 rounded-full bg-bg-tertiary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              direction === "bullish"
                ? "bg-green-500"
                : direction === "bearish"
                  ? "bg-red-500"
                  : "bg-amber-500"
            }`}
            style={{ width: `${Math.round(convictionStrength * 100)}%` }}
          />
        </div>
        <span className="text-xs text-text-secondary font-mono">
          {Math.round(convictionStrength * 100)}%
        </span>
      </div>
    </div>
  );
}
