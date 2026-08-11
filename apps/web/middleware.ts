import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  // tRPC — auth is enforced per-procedure (protectedProcedure checks the
  // session in context). Without this, clerkMiddleware's auth.protect()
  // returns 404 for any signed-out request, so every publicProcedure the
  // landing page calls (e.g. entity.stats) silently failed for visitors —
  // and the edge cached the 404s.
  "/api/trpc(.*)",
  // B2B REST API — authenticated via Bearer API key, not Clerk session
  "/api/v1(.*)",
  // MCP server for AI agents — authenticated via Bearer API key, not Clerk
  "/api/mcp(.*)",
  // Inngest endpoint — invoked by Inngest Cloud, authenticated via signing key
  "/api/inngest(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth();

  // Redirect authenticated users from landing page to dashboard
  if (userId && request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
