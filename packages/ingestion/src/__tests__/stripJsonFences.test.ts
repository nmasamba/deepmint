import { describe, it, expect } from "vitest";
import { stripJsonFences } from "../extractor";

/**
 * Deterministic regression tests for markdown code-fence stripping. The
 * previous implementation silently failed (causing JSON.parse to throw and all
 * extracted claims to be discarded) on two common LLM output shapes: a trailing
 * newline after the closing fence, and bare ``` fences with no language tag.
 */
describe("stripJsonFences", () => {
  const json = '{"claims":[]}';

  it("returns unfenced JSON unchanged", () => {
    expect(stripJsonFences(json)).toBe(json);
  });

  it("strips ```json fences", () => {
    expect(stripJsonFences("```json\n" + json + "\n```")).toBe(json);
  });

  it("strips a fence followed by a trailing newline", () => {
    expect(stripJsonFences("```json\n" + json + "\n```\n")).toBe(json);
  });

  it("strips bare ``` fences with no language tag", () => {
    expect(stripJsonFences("```\n" + json + "\n```")).toBe(json);
  });

  it("strips surrounding whitespace around fences", () => {
    expect(stripJsonFences("  ```json\n" + json + "\n```  ")).toBe(json);
  });

  it("produces JSON.parse-able output for every fenced shape", () => {
    for (const wrapped of [
      json,
      "```json\n" + json + "\n```",
      "```json\n" + json + "\n```\n",
      "```\n" + json + "\n```",
    ]) {
      expect(() => JSON.parse(stripJsonFences(wrapped))).not.toThrow();
    }
  });
});
