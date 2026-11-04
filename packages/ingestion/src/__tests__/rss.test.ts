import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeContentHash } from "../hasher";
import { RssSourceAdapter } from "../sources/rss";

/** A real feed over HTTP, through the real parser. */
const FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>t</title><link>https://example.test</link><description>d</description>
<item><title>Dated NVDA post</title><link>https://example.test/dated</link><description>Long NVDA.</description><pubDate>Mon, 02 Nov 2026 12:00:00 GMT</pubDate></item>
<item><title>Undated NVDA post</title><link>https://example.test/undated</link><description>Long NVDA.</description></item>
<item><title>Bad-date NVDA post</title><link>https://example.test/bad-date</link><description>Long NVDA.</description><pubDate>sometime last week</pubDate></item>
</channel></rss>`;

let server: Server;
let adapter: RssSourceAdapter;

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader("content-type", "application/rss+xml");
    res.end(FEED);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  adapter = new RssSourceAdapter([{ feedUrl: `http://127.0.0.1:${port}/feed`, entityId: "entity" }]);
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

describe("RssSourceAdapter dates", () => {
  it("keeps a dated item's own date", async () => {
    const captures = await adapter.fetchLatest();
    const dated = captures.find((c) => c.sourceUrl.endsWith("/dated"));
    expect(dated?.capturedAt.toISOString()).toBe("2026-11-02T12:00:00.000Z");
    expect(dated?.undated).toBe(false);
  });

  it("marks missing and malformed dates as undated, with a real capture time", async () => {
    const before = Date.now();
    const captures = await adapter.fetchLatest();
    for (const path of ["/undated", "/bad-date"]) {
      const item = captures.find((c) => c.sourceUrl.endsWith(path));
      expect(item?.undated).toBe(true);
      expect(item?.capturedAt.getTime()).toBeGreaterThanOrEqual(before);
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
