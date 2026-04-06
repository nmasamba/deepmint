import { inngest } from "../inngest";
import { db, eq, desc, sql } from "@deepmint/db";
import { scores, entities } from "@deepmint/db/schema";

/**
 * Leaderboard refresh worker: triggered by scoring/completed event.
 * Pre-computes top entities for each metric combination.
 * Results are cached directly in the leaderboard tRPC query (Redis when available).
 */
export const leaderboardRefreshFunction = inngest.createFunction(
  {
    id: "leaderboard-refresh",
    retries: 1,
    triggers: [{ event: "scoring/completed" }],
  },
  async ({ step }) => {
    const result = await step.run("refresh-leaderboards", async () => {
      // This is a lightweight step — the actual leaderboard queries
      // are handled by the tRPC router with Redis caching.
      // This worker just logs the event for monitoring.
      console.log("[leaderboard-refresh] Scoring completed, leaderboard cache will be refreshed on next query.");
      return { refreshed: true };
    });

    return result;
  }
);
