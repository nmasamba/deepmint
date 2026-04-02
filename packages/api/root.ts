import { router } from "./trpc";
import { entityRouter } from "./routers/entities";
import { instrumentRouter } from "./routers/instruments";
import { claimRouter } from "./routers/claims";

export const appRouter = router({
  entity: entityRouter,
  instruments: instrumentRouter,
  claims: claimRouter,
});

export type AppRouter = typeof appRouter;
