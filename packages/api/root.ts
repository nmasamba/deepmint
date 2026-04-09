import { router } from "./trpc";
import { entityRouter } from "./routers/entities";
import { instrumentRouter } from "./routers/instruments";
import { claimRouter } from "./routers/claims";
import { leaderboardRouter } from "./routers/leaderboard";
import { consensusRouter } from "./routers/consensus";
import { scoresRouter } from "./routers/scores";
import { socialRouter } from "./routers/social";
import { tickerRouter } from "./routers/ticker";
import { paperRouter } from "./routers/paper";
import { signalSimulateRouter } from "./routers/signalSimulate";
import { regimeRouter } from "./routers/regime";
import { influenceRouter } from "./routers/influence";
import { notificationsRouter } from "./routers/notifications";
import { brokerRouter } from "./routers/broker";
import { apiKeysRouter } from "./routers/apiKeys";

export const appRouter = router({
  entity: entityRouter,
  instruments: instrumentRouter,
  claims: claimRouter,
  leaderboard: leaderboardRouter,
  consensus: consensusRouter,
  scores: scoresRouter,
  social: socialRouter,
  ticker: tickerRouter,
  paper: paperRouter,
  signalSimulate: signalSimulateRouter,
  regime: regimeRouter,
  influence: influenceRouter,
  notifications: notificationsRouter,
  broker: brokerRouter,
  apiKeys: apiKeysRouter,
});

export type AppRouter = typeof appRouter;
