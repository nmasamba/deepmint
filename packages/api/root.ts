import { router } from "./trpc";
import { entityRouter } from "./routers/entities";
import { instrumentRouter } from "./routers/instruments";

export const appRouter = router({
  entity: entityRouter,
  instruments: instrumentRouter,
});

export type AppRouter = typeof appRouter;
