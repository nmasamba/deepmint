// Side-effect module: map the Vercel<>Inngest integration's prefixed keys
// (INNGEST_WORKFLOW_INNGEST_SIGNING_KEY / _EVENT_KEY) onto the standard env var
// names the Inngest SDK reads. This MUST run before `inngest/next` is imported,
// so it lives in its own module and is imported first in route.ts (ES import
// statements are hoisted and execute in source order).
for (const key of ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"] as const) {
  const prefixed = process.env[`INNGEST_WORKFLOW_${key}`];
  if (!process.env[key] && prefixed) process.env[key] = prefixed;
}

export {};
