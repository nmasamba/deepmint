import { ingestFunction } from "../functions/ingest";
import { extractFunction } from "../functions/extract";
import { auditFunction } from "../functions/audit";
import { markoutFunction } from "../functions/markout";
import { scoreFunction } from "../functions/score";
import { leaderboardRefreshFunction } from "../functions/leaderboard-refresh";
import { consensusSignalFunction } from "../functions/consensus-signal";
import { digestFunction } from "../functions/digest";
import { signalSimulateFunction } from "../functions/signal-simulate";
import { influenceTrackFunction } from "../functions/influence-track";
import { influenceAggregateFunction } from "../functions/influence-aggregate";
import { notifyNewFollowerFunction } from "../functions/notify-new-follower";
import { backfillPricesFunction } from "../functions/backfill-prices";
import { brokerSyncFunction } from "../functions/broker-sync";

// Export all Inngest functions for the serve handler
export const inngestFunctions = [
  ingestFunction,
  extractFunction,
  auditFunction,
  markoutFunction,
  scoreFunction,
  leaderboardRefreshFunction,
  consensusSignalFunction,
  digestFunction,
  signalSimulateFunction,
  influenceTrackFunction,
  influenceAggregateFunction,
  notifyNewFollowerFunction,
  backfillPricesFunction,
  brokerSyncFunction,
];

// Re-export the Inngest client
export { inngest } from "../inngest";

// eslint-disable-next-line no-console
console.log(
  `Deepmint worker loaded: ${inngestFunctions.length} functions registered`,
);
