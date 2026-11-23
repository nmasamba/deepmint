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

/**
 * For the functions that call Polygon: one of their steps runs at a time,
 * across all of them and every environment (D23). The client's 12.5 s queue is
 * per process, so steps on two instances would otherwise overlap and exceed the
 * plan's 5 requests a minute together. A sleep holds no slot.
 *
 * extract-claims is left out on purpose: its steps hold a model call of up to
 * four minutes, and look up one close per claim with a stated rating date. A
 * backfill's do too, but it prices every claim and runs only when asked for.
 */
export const POLYGON_CONCURRENCY = {
  scope: "account",
  key: '"polygon"',
  limit: 1,
} as const;
