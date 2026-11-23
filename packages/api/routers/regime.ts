import { publicProcedure, router } from "../trpc";
import { getLatestMarketRegime } from "../lib/marketRegime";

export const regimeRouter = router({
  /**
   * The latest stored market regime (one snapshot per weekday, computed in the
   * background), or null before the first snapshot exists. Never computes the
   * regime here: that takes ~14 throttled Polygon calls.
   */
  current: publicProcedure.query(() => getLatestMarketRegime()),
});
