import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeContentHash } from "../hasher";
import { FEED_MAX_AGE_DAYS, RssSourceAdapter } from "../sources/rss";

/** A real feed over HTTP, through the real parser. */
const FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>t</title><link>https://example.test</link><description>d</description>
<item><title>Dated NVDA post</title><link>https://example.test/dated</link><description>Long NVDA.</description><pubDate>Mon, 02 Nov 2026 12:00:00 GMT</pubDate></item>
<item><title>Undated NVDA post</title><link>https://example.test/undated</link><description>Long NVDA.</description></item>
<item><title>Bad-date NVDA post</title><link>https://example.test/bad-date</link><description>Long NVDA.</description><pubDate>sometime last week</pubDate></item>
<item><title>Old NVDA post</title><link>https://example.test/old</link><description>Long NVDA.</description><pubDate>Tue, 20 Oct 2026 12:00:00 GMT</pubDate></item>
</channel></rss>`;

/** The reads below happen on 5 November 2026, three days after the dated post. */
const READ_AT = new Date("2026-11-05T12:00:00Z");
let feedUrl: string;

let server: Server;
let adapter: RssSourceAdapter;

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader("content-type", "application/rss+xml");
    res.end(FEED);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  feedUrl = `http://127.0.0.1:${port}/feed`;
  adapter = new RssSourceAdapter([{ feedUrl, entityId: "entity" }], () => READ_AT);
});

afterAll(() => {
  server.close();
});

// What ingest-sources does with a capture.
const hashes = async () => {
  const captures = await adapter.fetchLatest();
  return new Map(
    captures.map((c) => [
      c.sourceUrl,
      computeContentHash(c.sourceUrl, c.rawText, c.undated ? null : c.capturedAt),
    ]),
  );
};

describe("RssSourceAdapter age limit", () => {
  it(`leaves out posts published more than ${FEED_MAX_AGE_DAYS} days before the read`, async () => {
    const paths = (await adapter.fetchLatest()).map((c) => new URL(c.sourceUrl).pathname);
    expect(paths).not.toContain("/old");
    expect(paths).toContain("/dated");
  });

  it("drops a post once it is older than the limit, and keeps undated ones", async () => {
    const later = new RssSourceAdapter([{ feedUrl, entityId: "entity" }], () => new Date("2026-11-10T12:00:00Z"));
    const paths = (await later.fetchLatest()).map((c) => new URL(c.sourceUrl).pathname);
    expect(paths.sort()).toEqual(["/bad-date", "/undated"]);
  });
});

describe("RssSourceAdapter dates", () => {
  it("keeps a dated item's own date", async () => {
    const captures = await adapter.fetchLatest();
    const dated = captures.find((c) => c.sourceUrl.endsWith("/dated"));
    expect(dated?.capturedAt.toISOString()).toBe("2026-11-02T12:00:00.000Z");
    expect(dated?.undated).toBe(false);
  });

  it("marks missing and malformed dates as undated, dated at the read", async () => {
    const captures = await adapter.fetchLatest();
    for (const path of ["/undated", "/bad-date"]) {
      const item = captures.find((c) => c.sourceUrl.endsWith(path));
      expect(item?.undated).toBe(true);
      expect(item?.capturedAt.getTime()).toBe(READ_AT.getTime());
    }
  });

  it("gives an undated item the same hash on every run", async () => {
    const first = await hashes();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await hashes();
    expect(first.size).toBe(3);
    expect([...second.entries()]).toEqual([...first.entries()]);
  });
});
