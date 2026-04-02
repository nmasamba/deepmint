import { serve } from "inngest/next";
import { inngest, inngestFunctions } from "@deepmint/worker";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
