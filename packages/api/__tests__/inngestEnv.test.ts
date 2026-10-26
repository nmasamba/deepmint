import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const KEYS = [
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "INNGEST_WORKFLOW_INNGEST_EVENT_KEY",
  "INNGEST_WORKFLOW_INNGEST_SIGNING_KEY",
] as const;

describe("Inngest key mapping", () => {
  const saved: Partial<Record<(typeof KEYS)[number], string>> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    // Each test imports the routers afresh, so the side effect runs again.
    vi.resetModules();
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("maps the integration's prefixed keys when a router is imported", async () => {
    process.env.INNGEST_WORKFLOW_INNGEST_EVENT_KEY = "prefixed-event-key";
    process.env.INNGEST_WORKFLOW_INNGEST_SIGNING_KEY = "signkey-prefixed";

    // Builds its module-level Inngest client on import, as in production.
    await import("../routers/claims");

    expect(process.env.INNGEST_EVENT_KEY).toBe("prefixed-event-key");
    expect(process.env.INNGEST_SIGNING_KEY).toBe("signkey-prefixed");
  });

  it("keeps an unprefixed key that is already set", async () => {
    process.env.INNGEST_EVENT_KEY = "unprefixed";
    process.env.INNGEST_WORKFLOW_INNGEST_EVENT_KEY = "prefixed-event-key";

    await import("../routers/social");

    expect(process.env.INNGEST_EVENT_KEY).toBe("unprefixed");
  });
});
