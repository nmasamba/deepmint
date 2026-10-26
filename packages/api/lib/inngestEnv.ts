// Side-effect module: map the Vercel<>Inngest integration's prefixed keys
// (INNGEST_WORKFLOW_INNGEST_EVENT_KEY / _SIGNING_KEY) onto the standard env var
// names the Inngest SDK reads, unless those are already set.
//
// An Inngest client copies the environment when it is constructed, and the
// claims, social and instruments routers each construct one when their module
// loads. trpc.ts imports this module on its first line and every router
// imports ../trpc first, so the mapping runs before any of those clients
// exist. The worker client (apps/worker/inngest.ts) and /api/inngest import it
// too. ES imports run in source order.
for (const key of ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"] as const) {
  const prefixed = process.env[`INNGEST_WORKFLOW_${key}`];
  if (!process.env[key] && prefixed) process.env[key] = prefixed;
}

export {};
