import { serve } from "inngest/next";
import { inngest, inngestFunctions } from "@deepmint/worker";

// The Inngest client module (imported above) maps the integration's
// INNGEST_WORKFLOW_-prefixed keys onto the standard env var names, so serve()
// auto-reads INNGEST_SIGNING_KEY.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
