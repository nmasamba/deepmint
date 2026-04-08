"use client";

import { Badge } from "@/components/ui/badge";

const REGIME_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  bull: { label: "Bull", color: "text-green-400", bgColor: "bg-green-400/10 border-green-400/30" },
  bear: { label: "Bear", color: "text-red-400", bgColor: "bg-red-400/10 border-red-400/30" },
  high_vol: { label: "High Vol", color: "text-amber-400", bgColor: "bg-amber-400/10 border-amber-400/30" },
  low_vol: { label: "Low Vol", color: "text-blue-400", bgColor: "bg-blue-400/10 border-blue-400/30" },
  rotation: { label: "Rotation", color: "text-purple-400", bgColor: "bg-purple-400/10 border-purple-400/30" },
};

interface RegimeBadgeProps {
  regime: string;
  size?: "sm" | "md";
}

export function RegimeBadge({ regime, size = "md" }: RegimeBadgeProps) {
  const config = REGIME_CONFIG[regime] ?? REGIME_CONFIG.bull;

  return (
    <Badge
      variant="outline"
      className={`${config.bgColor} ${config.color} ${
        size === "sm" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5"
      }`}
    >
      {config.label}
    </Badge>
  );
}
