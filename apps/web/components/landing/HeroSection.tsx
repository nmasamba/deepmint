import Link from "next/link";
import { ArrowRight, BarChart3 } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative flex min-h-[70vh] flex-col justify-center px-4 sm:px-8">
      {/* Radial glow — positioned behind headline area */}
      <div className="pointer-events-none absolute left-[20%] top-[30%] h-[400px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.04] blur-[100px]" />
      {/* Top-down gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-accent/[0.03] via-transparent to-transparent" />

      <div className="relative z-10 mx-auto max-w-3xl space-y-6">
        <h1 className="text-left text-4xl font-bold tracking-tight text-text-primary sm:text-5xl md:text-6xl">
          Follow the market&apos;s smart movers.{" "}
          <span className="text-accent">Or better yet, become one.</span>
        </h1>

        <p className="max-w-xl text-lg text-text-secondary">
          Deepmint is the AI-powered arena where analysts stake their
          reputation on real predictions and traders finally know who&apos;s
          worth listening to. Every call recorded. Every outcome scored.
          No hiding.
        </p>

        <div className="flex flex-col items-start gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 font-medium text-bg-primary transition-colors hover:bg-accent/90"
          >
            Claim Your Seat
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/leaderboard"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent"
          >
            <BarChart3 className="h-4 w-4" />
            See Who&apos;s Leading
          </Link>
        </div>
      </div>
    </section>
  );
}
