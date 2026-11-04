// Import FIRST — maps the integration's INNGEST_WORKFLOW_-prefixed keys onto
// the standard env var names before inngest/next loads (imports are hoisted and
// run in source order).
import "./inngest-env";
import { serve } from "inngest/next";
import { inngest, inngestFunctions } from "@deepmint/worker";

// Each Inngest step is one invocation of this route. Steps are sized to fit: an
// LLM extraction is at most two 120 s model calls, a markout one priced claim.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
