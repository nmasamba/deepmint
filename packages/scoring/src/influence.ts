/**
 * Influence detection (build_spec §2.8).
 *
 * Detects when a Player acts on the same instrument + direction
 * within a time window after a Guide's claim.
 */

export interface GuideClaimWindow {
  claimId: string;
  entityId: string;
  instrumentId: string;
  direction: "long" | "short" | "neutral";
  createdAt: Date;
}

export interface PlayerAction {
  entityId: string;
  claimId?: string;
  tradeId?: string;
  instrumentId: string;
  direction: "long" | "short" | "neutral";
  createdAt: Date;
}

export interface InfluenceEvent {
  guideClaimId: string;
  guideEntityId: string;
  playerEntityId: string;
  playerClaimId?: string;
  playerTradeId?: string;
  instrumentId: string;
  lagHours: number;
  directionMatch: boolean;
}

/**
 * Detect influence events from guide claims and player actions.
 *
 * Window: 48 hours (configurable).
 * Only counts if:
 * - Same instrument
 * - Player follows the Guide (social graph)
 * - Player acted AFTER the Guide's claim
 * - Within the time window
 */
export function detectInfluenceEvents(
  guideClaims: GuideClaimWindow[],
  playerActions: PlayerAction[],
  followGraph: Map<string, Set<string>>, // playerId → Set<guideIds they follow>
  windowHours: number = 48,
): InfluenceEvent[] {
  const events: InfluenceEvent[] = [];

  for (const action of playerActions) {
    const guideIdsFollowed = followGraph.get(action.entityId);
    if (!guideIdsFollowed) continue;

    for (const claim of guideClaims) {
      // Must follow this guide
      if (!guideIdsFollowed.has(claim.entityId)) continue;
      // Same instrument
      if (claim.instrumentId !== action.instrumentId) continue;
      // Player acted after guide
      const lagMs = action.createdAt.getTime() - claim.createdAt.getTime();
      if (lagMs <= 0) continue;
      const lagHours = lagMs / (1000 * 60 * 60);
      if (lagHours > windowHours) continue;

      events.push({
        guideClaimId: claim.claimId,
        guideEntityId: claim.entityId,
        playerEntityId: action.entityId,
        playerClaimId: action.claimId,
        playerTradeId: action.tradeId,
        instrumentId: action.instrumentId,
        lagHours: Math.round(lagHours * 100) / 100,
        directionMatch: claim.direction === action.direction,
      });
    }
  }

  return events;
}
