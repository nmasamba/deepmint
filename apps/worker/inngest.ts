import { Inngest } from "inngest";

// The Vercel<>Inngest integration provisions the keys with an INNGEST_WORKFLOW_
// prefix that the SDK does not auto-read. Map them onto the standard env var
// names (unless already set) so the client (event key) and serve() (signing
// key) pick them up. This module is imported before serve() runs.
for (const key of ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"] as const) {
  const prefixed = process.env[`INNGEST_WORKFLOW_${key}`];
  if (!process.env[key] && prefixed) process.env[key] = prefixed;
}

export const inngest = new Inngest({ id: "deepmint" });
