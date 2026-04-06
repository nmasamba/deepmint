import { ingestFunction } from "../functions/ingest";
import { extractFunction } from "../functions/extract";
import { auditFunction } from "../functions/audit";
import { markoutFunction } from "../functions/markout";
import { scoreFunction } from "../functions/score";
import { leaderboardRefreshFunction } from "../functions/leaderboard-refresh";
import { consensusSignalFunction } from "../functions/consensus-signal";

// Export all Inngest functions for the serve handler
export const inngestFunctions = [
  ingestFunction,
  extractFunction,
  auditFunction,
  markoutFunction,
  scoreFunction,
  leaderboardRefreshFunction,
  consensusSignalFunction,
];

// Re-export the Inngest client
export { inngest } from "../inngest";

// eslint-disable-next-line no-console
console.log(
  `Deepmint worker loaded: ${inngestFunctions.length} functions registered`,
);
