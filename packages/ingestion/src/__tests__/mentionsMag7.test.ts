import { describe, it, expect } from "vitest";
import { mentionsMag7 } from "../extractor";

/**
 * Deterministic tests for the pre-filter that gates the (slow, paid) LLM
 * extraction call. It must be high-recall: never drop text that plausibly
 * references a Mag-7 instrument, while skipping clearly off-topic text.
 */
describe("mentionsMag7", () => {
  it("matches ticker symbols", () => {
    for (const t of ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"]) {
      expect(mentionsMag7(`Bullish on ${t} into earnings`)).toBe(true);
    }
  });

  it("matches $cashtags and lowercase tickers", () => {
    expect(mentionsMag7("loading up on $NVDA")).toBe(true);
    expect(mentionsMag7("aapl looks strong")).toBe(true);
  });

  it("matches company names", () => {
    expect(mentionsMag7("Apple's iPhone cycle looks strong")).toBe(true);
    expect(mentionsMag7("Tesla margins under pressure")).toBe(true);
    expect(mentionsMag7("Alphabet ad revenue accelerating")).toBe(true);
    expect(mentionsMag7("Nvidia AI demand surging")).toBe(true);
  });

  it("skips off-topic text with no Mag-7 reference", () => {
    expect(mentionsMag7("The weather in San Francisco is sunny today.")).toBe(
      false,
    );
    expect(mentionsMag7("I'm bullish on AMD and Intel.")).toBe(false);
  });

  it("does not false-match substrings like 'metadata'", () => {
    expect(mentionsMag7("Updating the metadata schema for the API.")).toBe(
      false,
    );
  });
});
