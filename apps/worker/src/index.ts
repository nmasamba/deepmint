import { ingestFunction } from "../functions/ingest";
import { extractFunction } from "../functions/extract";
import { auditFunction } from "../functions/audit";

// Export all Inngest functions for the serve handler
export const inngestFunctions = [
  ingestFunction,
  extractFunction,
  auditFunction,
];

// Re-export the Inngest client
export { inngest } from "../inngest";

// eslint-disable-next-line no-console
console.log(
  `Deepmint worker loaded: ${inngestFunctions.length} functions registered`,
);
