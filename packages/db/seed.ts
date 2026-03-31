import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const client = postgres(connectionString);
const db = drizzle(client, { schema });

// ── Helpers ──────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Seed Data ────────────────────────────────────────────────────

async function seed() {
  // eslint-disable-next-line no-console
  console.log("🌱 Seeding database...\n");

  // ── 1. Instruments (Magnificent 7) ──

  const mag7Data = [
    { ticker: "AAPL", name: "Apple Inc.", sector: "Technology", industry: "Consumer Electronics" },
    { ticker: "MSFT", name: "Microsoft Corporation", sector: "Technology", industry: "Software—Infrastructure" },
    { ticker: "GOOGL", name: "Alphabet Inc.", sector: "Technology", industry: "Internet Content & Information" },
    { ticker: "AMZN", name: "Amazon.com Inc.", sector: "Consumer Cyclical", industry: "Internet Retail" },
    { ticker: "NVDA", name: "NVIDIA Corporation", sector: "Technology", industry: "Semiconductors" },
    { ticker: "META", name: "Meta Platforms Inc.", sector: "Technology", industry: "Internet Content & Information" },
    { ticker: "TSLA", name: "Tesla Inc.", sector: "Consumer Cyclical", industry: "Auto Manufacturers" },
  ];

  const instrumentRows = await db
    .insert(schema.instruments)
    .values(
      mag7Data.map((i) => ({
        ticker: i.ticker,
        name: i.name,
        assetClass: "equity" as const,
        exchange: "NASDAQ" as const,
        sector: i.sector,
        industry: i.industry,
        marketCapBucket: "mega",
        isActive: true,
      })),
    )
    .returning();

  // eslint-disable-next-line no-console
  console.log(`✓ Inserted ${instrumentRows.length} instruments`);

  // ── 2. Guide Entities ──

  const guidesData = [
    {
      displayName: "Sarah Chen",
      slug: "sarah-chen",
      bio: "Tech sector specialist. Growth and momentum focus. 12+ years covering FAANG/Mag 7.",
      styleTags: ["growth", "tech", "momentum"],
    },
    {
      displayName: "Marcus Webb",
      slug: "marcus-webb",
      bio: "Value investor with a large-cap focus. Patient, fundamentals-driven approach.",
      styleTags: ["value", "large-cap", "fundamentals"],
    },
    {
      displayName: "Priya Patel",
      slug: "priya-patel",
      bio: "Macro strategist. Cross-sector analysis connecting global trends to equity plays.",
      styleTags: ["macro", "cross-sector", "rates"],
    },
    {
      displayName: "David Kim",
      slug: "david-kim",
      bio: "Contrarian analyst. Finds opportunities where consensus is wrong.",
      styleTags: ["contrarian", "catalyst", "deep-dive"],
    },
    {
      displayName: "Elena Rodriguez",
      slug: "elena-rodriguez",
      bio: "Quantitative analyst. Factor-based models and systematic evaluation.",
      styleTags: ["quantitative", "factor", "systematic"],
    },
  ];

  const guideRows = await db
    .insert(schema.entities)
    .values(
      guidesData.map((g) => ({
        type: "guide" as const,
        displayName: g.displayName,
        slug: g.slug,
        bio: g.bio,
        styleTags: g.styleTags,
        isAllowlisted: true,
        isVerified: true,
      })),
    )
    .returning();

  // eslint-disable-next-line no-console
  console.log(`✓ Inserted ${guideRows.length} guides`);

  // ── 3. Player Entities ──

  const playersData = [
    {
      displayName: "Alex Trading",
      slug: "alex-trading",
      bio: "Swing trader focused on tech. Building a verified track record.",
      styleTags: ["swing", "tech"],
      brokerLinkStatus: "verified" as const,
      isVerified: true,
    },
    {
      displayName: "Jordan Macro",
      slug: "jordan-macro",
      bio: "Macro-driven positions. Long-term conviction trades.",
      styleTags: ["macro", "long-term"],
      brokerLinkStatus: "none" as const,
      isVerified: false,
    },
    {
      displayName: "Sam Momentum",
      slug: "sam-momentum",
      bio: "Momentum and breakout trader. Data-driven entries and exits.",
      styleTags: ["momentum", "breakout"],
      brokerLinkStatus: "none" as const,
      isVerified: false,
    },
  ];

  const playerRows = await db
    .insert(schema.entities)
    .values(
      playersData.map((p) => ({
        type: "player" as const,
        displayName: p.displayName,
        slug: p.slug,
        bio: p.bio,
        styleTags: p.styleTags,
        brokerLinkStatus: p.brokerLinkStatus,
        isVerified: p.isVerified,
      })),
    )
    .returning();

  // eslint-disable-next-line no-console
  console.log(`✓ Inserted ${playerRows.length} players`);

  // ── 4. Historical Claims (20 per Guide = 100 total) ──

  const directions = ["long", "short", "neutral"] as const;
  const horizons = [30, 90, 180, 365];
  const tagOptions = [
    "earnings", "technical", "macro", "sector", "catalyst",
    "valuation", "momentum", "contrarian",
  ];

  const rationales = [
    "Strong earnings beat expected with cloud growth accelerating. Revenue guidance should lift the stock.",
    "Valuation stretched relative to peers. Risk/reward skews negative at current levels.",
    "Technical breakout above 200-day MA with volume confirmation. Bullish momentum building.",
    "Macro headwinds from rising rates will pressure multiples. Underweight recommendation.",
    "AI tailwinds underappreciated by the market. Significant upside to consensus estimates.",
    "Sector rotation into value names likely as growth decelerates. Neutral stance warranted.",
    "Insider selling pattern concerning. Management confidence appears low.",
    "New product cycle catalyst should drive revenue acceleration in coming quarters.",
    "Market overreacting to short-term noise. Core business fundamentals remain strong.",
    "Competitive threats intensifying. Market share at risk from smaller, nimble competitors.",
  ];

  // Realistic price ranges for each ticker (in cents)
  const priceRanges: Record<string, [number, number]> = {
    AAPL: [16000, 24000],
    MSFT: [35000, 45000],
    GOOGL: [13000, 19000],
    AMZN: [15000, 22000],
    NVDA: [50000, 140000],
    META: [40000, 65000],
    TSLA: [15000, 40000],
  };

  const claimValues = [];
  for (const guide of guideRows) {
    for (let i = 0; i < 20; i++) {
      const instrument = pick(instrumentRows);
      const direction = pick(directions);
      const horizon = pick(horizons);
      const daysBack = randomBetween(90, 365);
      const createdAt = daysAgo(daysBack);
      const range = priceRanges[instrument.ticker] ?? [20000, 30000];
      const entryPrice = randomBetween(range[0], range[1]);
      const hasConfidence = Math.random() > 0.4; // ~60% have confidence
      const hasTarget = direction !== "neutral" && Math.random() > 0.5;
      const tags = [pick(tagOptions), pick(tagOptions)].filter(
        (t, idx, arr) => arr.indexOf(t) === idx,
      );

      claimValues.push({
        entityId: guide.id,
        instrumentId: instrument.id,
        direction,
        horizonDays: horizon,
        confidence: hasConfidence ? randomBetween(50, 95) : null,
        targetPriceCents: hasTarget
          ? direction === "long"
            ? entryPrice + randomBetween(500, 3000)
            : entryPrice - randomBetween(500, 3000)
          : null,
        rationale: pick(rationales),
        rationaleTags: tags,
        entryPriceCents: entryPrice,
        status: "active" as const,
        createdAt,
      });
    }
  }

  const claimRows = await db
    .insert(schema.claims)
    .values(claimValues)
    .returning();

  // eslint-disable-next-line no-console
  console.log(`✓ Inserted ${claimRows.length} claims`);

  // ── 5. Player Trades (30 per Player = 90 total) ──

  const tradeValues = [];
  for (const player of playerRows) {
    const isVerifiedPlayer = player.brokerLinkStatus === "verified";

    for (let i = 0; i < 30; i++) {
      const instrument = pick(instrumentRows);
      const side = Math.random() > 0.5 ? ("buy" as const) : ("sell" as const);
      const daysBack = randomBetween(30, 300);
      const openedAt = daysAgo(daysBack);
      const range = priceRanges[instrument.ticker] ?? [20000, 30000];
      const entryPrice = randomBetween(range[0], range[1]);
      const isClosed = Math.random() > 0.2; // 80% closed
      const exitPrice = isClosed
        ? entryPrice + randomBetween(-2000, 3000)
        : null;
      const closedAt = isClosed
        ? daysAgo(daysBack - randomBetween(5, 60))
        : null;

      tradeValues.push({
        entityId: player.id,
        instrumentId: instrument.id,
        side,
        entryPriceCents: entryPrice,
        exitPriceCents: exitPrice,
        quantity: `${randomBetween(10, 500)}`,
        openedAt,
        closedAt,
        isVerified: isVerifiedPlayer,
      });
    }
  }

  await db.insert(schema.playerTrades).values(tradeValues);

  // eslint-disable-next-line no-console
  console.log(`✓ Inserted ${tradeValues.length} player trades`);

  // ── 6. Consensus Signals (1 per instrument) ──

  const consensusValues = instrumentRows.map((instrument) => {
    const longCount = randomBetween(3, 8);
    const shortCount = randomBetween(1, 4);
    const neutralCount = randomBetween(0, 2);
    const totalWeight = longCount * 1.2 + shortCount * 1.0 + neutralCount * 0.8;
    const bullish = (longCount * 1.2) / totalWeight;
    const bearish = (shortCount * 1.0) / totalWeight;
    const neutral = (neutralCount * 0.8) / totalWeight;
    const direction =
      bullish > bearish && bullish > neutral
        ? ("bullish" as const)
        : bearish > bullish && bearish > neutral
          ? ("bearish" as const)
          : ("neutral" as const);
    const conviction = Math.sqrt(
      bullish * bullish + bearish * bearish + neutral * neutral,
    );
    const minConviction = 1 / Math.sqrt(3);
    const convictionStrength = Math.max(
      0,
      Math.min(1, (conviction - minConviction) / (1 - minConviction)),
    );

    return {
      instrumentId: instrument.id,
      direction,
      longCount,
      shortCount,
      neutralCount,
      weightedBullishScore: bullish.toFixed(6),
      weightedBearishScore: bearish.toFixed(6),
      weightedNeutralScore: neutral.toFixed(6),
      convictionStrength: convictionStrength.toFixed(4),
      activeClaims: longCount + shortCount + neutralCount,
      asOfDate: today(),
    };
  });

  await db.insert(schema.consensusSignals).values(consensusValues);

  // eslint-disable-next-line no-console
  console.log(`✓ Inserted ${consensusValues.length} consensus signals`);

  // ── 7. Influence Events (15 total) ──

  const influenceValues = [];
  for (let i = 0; i < 15; i++) {
    const guide = pick(guideRows);
    const player = pick(playerRows);
    const guideClaim = pick(
      claimRows.filter((c) => c.entityId === guide.id),
    );
    if (!guideClaim) continue;

    influenceValues.push({
      guideEntityId: guide.id,
      guideClaimId: guideClaim.id,
      playerEntityId: player.id,
      instrumentId: guideClaim.instrumentId,
      lagHours: `${randomBetween(2, 36)}.${randomBetween(0, 99)}`,
      directionMatch: Math.random() > 0.3, // 70% match
    });
  }

  if (influenceValues.length > 0) {
    await db.insert(schema.influenceEvents).values(influenceValues);
  }

  // eslint-disable-next-line no-console
  console.log(`✓ Inserted ${influenceValues.length} influence events`);

  // ── 8. Follow Relationships ──

  const followValues = [];
  for (const player of playerRows) {
    // Each player follows 2-3 guides
    const numFollows = randomBetween(2, 3);
    const shuffled = [...guideRows].sort(() => Math.random() - 0.5);
    for (let i = 0; i < numFollows; i++) {
      followValues.push({
        followerId: player.id,
        followedId: shuffled[i]!.id,
      });
    }
  }

  await db.insert(schema.follows).values(followValues);

  // eslint-disable-next-line no-console
  console.log(`✓ Inserted ${followValues.length} follows`);

  // eslint-disable-next-line no-console
  console.log("\n✅ Seed complete!\n");

  await client.end();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Seed failed:", err);
  process.exit(1);
});
