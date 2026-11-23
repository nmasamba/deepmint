// First: map the integration's INNGEST_WORKFLOW_-prefixed keys onto the names
// the SDK reads, so the client (event key) and serve() (signing key) see them.
import "@deepmint/api/lib/inngestEnv";
import { Inngest } from "inngest";

/**
 * One step per request. By default (checkpointing) the SDK runs a run's steps
 * back to back in one request until it sleeps, so together they would share the
 * 300 s of /api/inngest, which each step is sized for on its own.
 */
export const inngest = new Inngest({ id: "deepmint", checkpointing: false });
