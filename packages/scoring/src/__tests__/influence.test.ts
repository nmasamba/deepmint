import { describe, it, expect } from "vitest";
import { detectInfluenceEvents } from "../influence";
import type { GuideClaimWindow, PlayerAction } from "../influence";

function makeDate(hoursAgo: number): Date {
  return new Date(Date.now() - hoursAgo * 3600 * 1000);
}

describe("detectInfluenceEvents", () => {
  const guideId = "guide-1";
  const playerId = "player-1";
  const instrumentId = "inst-aapl";

  // Player follows guide
  const followGraph = new Map<string, Set<string>>([
    [playerId, new Set([guideId])],
  ]);

  it("detects influence when player acts on same instrument+direction within 48h", () => {
    const guideClaims: GuideClaimWindow[] = [
      {
        claimId: "gc-1",
        entityId: guideId,
        instrumentId,
        direction: "long",
        createdAt: makeDate(24), // 24h ago
      },
    ];

    const playerActions: PlayerAction[] = [
      {
        entityId: playerId,
        claimId: "pc-1",
        instrumentId,
        direction: "long",
        createdAt: makeDate(12), // 12h ago (12h after guide)
      },
    ];

    const events = detectInfluenceEvents(guideClaims, playerActions, followGraph);

    expect(events).toHaveLength(1);
    expect(events[0].guideClaimId).toBe("gc-1");
    expect(events[0].playerEntityId).toBe(playerId);
    expect(events[0].directionMatch).toBe(true);
    expect(events[0].lagHours).toBeCloseTo(12, 0);
  });

  it("returns empty for different instrument", () => {
    const guideClaims: GuideClaimWindow[] = [
      {
        claimId: "gc-1",
        entityId: guideId,
        instrumentId,
        direction: "long",
        createdAt: makeDate(24),
      },
    ];

    const playerActions: PlayerAction[] = [
      {
        entityId: playerId,
        claimId: "pc-1",
        instrumentId: "inst-msft", // different instrument
        direction: "long",
        createdAt: makeDate(12),
      },
    ];

    const events = detectInfluenceEvents(guideClaims, playerActions, followGraph);
    expect(events).toHaveLength(0);
  });

  it("returns empty when player does not follow guide", () => {
    const emptyGraph = new Map<string, Set<string>>();

    const guideClaims: GuideClaimWindow[] = [
      {
        claimId: "gc-1",
        entityId: guideId,
        instrumentId,
        direction: "long",
        createdAt: makeDate(24),
      },
    ];

    const playerActions: PlayerAction[] = [
      {
        entityId: playerId,
        claimId: "pc-1",
        instrumentId,
        direction: "long",
        createdAt: makeDate(12),
      },
    ];

    const events = detectInfluenceEvents(guideClaims, playerActions, emptyGraph);
    expect(events).toHaveLength(0);
  });

  it("returns empty when player acted BEFORE guide", () => {
    const guideClaims: GuideClaimWindow[] = [
      {
        claimId: "gc-1",
        entityId: guideId,
        instrumentId,
        direction: "long",
        createdAt: makeDate(12), // 12h ago
      },
    ];

    const playerActions: PlayerAction[] = [
      {
        entityId: playerId,
        claimId: "pc-1",
        instrumentId,
        direction: "long",
        createdAt: makeDate(24), // 24h ago (BEFORE guide)
      },
    ];

    const events = detectInfluenceEvents(guideClaims, playerActions, followGraph);
    expect(events).toHaveLength(0);
  });

  it("returns empty when lag exceeds 48h window", () => {
    const guideClaims: GuideClaimWindow[] = [
      {
        claimId: "gc-1",
        entityId: guideId,
        instrumentId,
        direction: "long",
        createdAt: makeDate(72), // 72h ago
      },
    ];

    const playerActions: PlayerAction[] = [
      {
        entityId: playerId,
        claimId: "pc-1",
        instrumentId,
        direction: "long",
        createdAt: makeDate(1), // 1h ago (71h after guide — exceeds 48h)
      },
    ];

    const events = detectInfluenceEvents(guideClaims, playerActions, followGraph);
    expect(events).toHaveLength(0);
  });

  it("sets directionMatch=true for same direction and false for different", () => {
    const guideClaims: GuideClaimWindow[] = [
      {
        claimId: "gc-1",
        entityId: guideId,
        instrumentId,
        direction: "long",
        createdAt: makeDate(24),
      },
    ];

    // Same direction
    const sameDir: PlayerAction[] = [
      {
        entityId: playerId,
        claimId: "pc-1",
        instrumentId,
        direction: "long",
        createdAt: makeDate(12),
      },
    ];

    // Different direction
    const diffDir: PlayerAction[] = [
      {
        entityId: playerId,
        claimId: "pc-2",
        instrumentId,
        direction: "short",
        createdAt: makeDate(12),
      },
    ];

    const sameEvents = detectInfluenceEvents(guideClaims, sameDir, followGraph);
    expect(sameEvents[0].directionMatch).toBe(true);

    const diffEvents = detectInfluenceEvents(guideClaims, diffDir, followGraph);
    expect(diffEvents[0].directionMatch).toBe(false);
  });

  it("matches multiple guide claims within window", () => {
    const guideClaims: GuideClaimWindow[] = [
      {
        claimId: "gc-1",
        entityId: guideId,
        instrumentId,
        direction: "long",
        createdAt: makeDate(30),
      },
      {
        claimId: "gc-2",
        entityId: guideId,
        instrumentId,
        direction: "long",
        createdAt: makeDate(20),
      },
    ];

    const playerActions: PlayerAction[] = [
      {
        entityId: playerId,
        claimId: "pc-1",
        instrumentId,
        direction: "long",
        createdAt: makeDate(10), // within 48h of both claims
      },
    ];

    const events = detectInfluenceEvents(guideClaims, playerActions, followGraph);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.guideClaimId).sort()).toEqual(["gc-1", "gc-2"]);
  });

  it("returns empty for empty input arrays", () => {
    expect(detectInfluenceEvents([], [], followGraph)).toHaveLength(0);
    expect(
      detectInfluenceEvents(
        [{ claimId: "gc-1", entityId: guideId, instrumentId, direction: "long", createdAt: makeDate(24) }],
        [],
        followGraph,
      ),
    ).toHaveLength(0);
    expect(
      detectInfluenceEvents(
        [],
        [{ entityId: playerId, claimId: "pc-1", instrumentId, direction: "long", createdAt: makeDate(12) }],
        followGraph,
      ),
    ).toHaveLength(0);
  });
});
