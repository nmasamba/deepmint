import { describe, it, expect } from "vitest";
import { API_KEY, fetchApi } from "./helpers";

const skip = !API_KEY;

describe.skipIf(skip)("GET /api/v1/instruments/:ticker/consensus", () => {
  it("returns 200 for AAPL with valid key", async () => {
    const res = await fetchApi("/api/v1/instruments/AAPL/consensus");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.instrument).toBeDefined();
    expect(body.data.instrument.ticker).toBe("AAPL");
    expect(body.meta).toBeDefined();
    expect(body.meta.requestId).toBeDefined();
  });

  it("returns 401 when no Authorization header", async () => {
    const res = await fetchApi("/api/v1/instruments/AAPL/consensus", { key: null });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 for unknown ticker", async () => {
    const res = await fetchApi("/api/v1/instruments/ZZZZ/consensus");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("handles case insensitivity (lowercase ticker)", async () => {
    const res = await fetchApi("/api/v1/instruments/aapl/consensus");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.instrument.ticker).toBe("AAPL");
  });

  it("includes rate limit headers", async () => {
    const res = await fetchApi("/api/v1/instruments/AAPL/consensus");
    expect(res.headers.get("x-ratelimit-limit")).toBeDefined();
    expect(res.headers.get("x-ratelimit-remaining")).toBeDefined();
  });
});
