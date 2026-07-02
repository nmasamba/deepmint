// Import FIRST — maps the integration's INNGEST_WORKFLOW_-prefixed keys onto
// the standard env var names before inngest/next loads (imports are hoisted and
// run in source order).
import "./inngest-env";
import { serve } from "inngest/next";
import { inngest, inngestFunctions } from "@deepmint/worker";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
