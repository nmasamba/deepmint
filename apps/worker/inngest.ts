// First: map the integration's INNGEST_WORKFLOW_-prefixed keys onto the names
// the SDK reads, so the client (event key) and serve() (signing key) see them.
import "@deepmint/api/lib/inngestEnv";
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "deepmint" });
