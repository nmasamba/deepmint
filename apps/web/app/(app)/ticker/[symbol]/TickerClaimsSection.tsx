"use client";

import { ClaimsTimeline } from "@/components/claims/ClaimsTimeline";

interface TickerClaimsSectionProps {
  instrumentId: string;
}

export function TickerClaimsSection({ instrumentId }: TickerClaimsSectionProps) {
  return <ClaimsTimeline instrumentId={instrumentId} />;
}
