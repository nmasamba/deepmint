import { router } from "./trpc";
import { entityRouter } from "./routers/entities";
import { instrumentRouter } from "./routers/instruments";
import { claimRouter } from "./routers/claims";
import { leaderboardRouter } from "./routers/leaderboard";
import { consensusRouter } from "./routers/consensus";
import { scoresRouter } from "./routers/scores";
import { socialRouter } from "./routers/social";

export const appRouter = router({
  entity: entityRouter,
  instruments: instrumentRouter,
  claims: claimRouter,
  leaderboard: leaderboardRouter,
  consensus: consensusRouter,
  scores: scoresRouter,
  social: socialRouter,
});

export type AppRouter = typeof appRouter;
