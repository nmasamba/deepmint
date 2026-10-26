// Side-effect module: map the Vercel<>Inngest integration's prefixed keys
// (INNGEST_WORKFLOW_INNGEST_SIGNING_KEY / _EVENT_KEY) onto the standard env var
// names the Inngest SDK reads. This MUST run before `inngest/next` is imported,
// so route.ts imports it first (ES import statements are hoisted and execute in
// source order). The mapping itself is shared with the tRPC routers' clients.
import "@deepmint/api/lib/inngestEnv";
