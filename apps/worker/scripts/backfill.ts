/**
 * Operator script: trigger a historical backfill from an analyst archive file.
 *
 * Usage:
 *   pnpm --filter @deepmint/worker backfill ./archive.json
 *
 * The archive file is JSON matching the `backfill/requested` payload:
 *   {
 *     "analysts": [
 *       {
 *         "handle": "stratechery",
 *         "displayName": "Ben Thompson",
 *         "sourceUrl": "https://stratechery.com/feed",
 *         "styleTags": ["tech", "macro"],
 *         "items": [
 *           { "publishedAt": "2025-03-01T14:00:00Z", "rawText": "...", "url": "..." }
 *         ]
 *       }
 *     ]
 *   }
 *
 * In local dev this delivers to the Inngest dev server. In production it
 * requires INNGEST_EVENT_KEY to be configured so the event reaches Inngest
 * Cloud, which then invokes the deployed /api/inngest endpoint.
 */
import { readFileSync } from "node:fs";
import { inngest } from "../inngest";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: pnpm --filter @deepmint/worker backfill <archive.json>");
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(path, "utf8"));
  const analysts = payload.analysts ?? [];
  const itemCount = analysts.reduce(
    (sum: number, a: { items?: unknown[] }) => sum + (a.items?.length ?? 0),
    0,
  );

  await inngest.send({ name: "backfill/requested", data: payload });
  console.log(
    `Sent backfill/requested: ${analysts.length} analysts, ${itemCount} items.`,
  );
}

main().catch((err) => {
  console.error("Backfill trigger failed:", err);
  process.exit(1);
});
