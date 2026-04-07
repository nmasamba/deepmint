import Link from "next/link";
import {
  ArrowRight,
  Shield,
  TrendingUp,
  Target,
  BarChart3,
  Users,
  BrainCircuit,
} from "lucide-react";

export function ChoosePath() {
  return (
    <section className="border-t border-border/50 px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-2xl font-bold text-text-primary sm:text-3xl">
          Pick a Side
        </h2>
        <p className="mt-2 text-center text-text-secondary">
          Call the shots or ride with those who do. Either way, the AI is
          watching.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Guide card */}
          <div className="group relative overflow-hidden rounded-xl border border-border bg-bg-secondary p-8 transition-colors hover:border-accent/40">
            <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-accent/5 transition-transform group-hover:scale-150" />

            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 ring-1 ring-accent/20">
                <Shield className="h-6 w-6 text-accent" />
              </div>

              <h3 className="mt-4 text-xl font-bold text-text-primary">
                I&apos;m an Analyst
              </h3>
              <p className="mt-1 text-sm font-medium text-accent">
                Enter as a Guide
              </p>

              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                You read the tape better than most and you know it. Deepmint
                gives you a stage with receipts — every prediction locked,
                timestamped, and scored by AI against the actual close. Build
                the track record that shuts the skeptics up.
              </p>

              <ul className="mt-5 space-y-2.5">
                <li className="flex items-start gap-2 text-sm text-text-secondary">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>
                    Publish immutable calls — ticker, direction, target, horizon
                  </span>
                </li>
                <li className="flex items-start gap-2 text-sm text-text-secondary">
                  <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>
                    AI benchmarks you against Wall Street consensus automatically
                  </span>
                </li>
                <li className="flex items-start gap-2 text-sm text-text-secondary">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>
                    Attract followers who trust data, not tweets
                  </span>
                </li>
              </ul>

              <Link
                href="/sign-up"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-bg-primary transition-colors hover:bg-accent/90"
              >
                Sign Up as a Guide
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Player card */}
          <div className="group relative overflow-hidden rounded-xl border border-border bg-bg-secondary p-8 transition-colors hover:border-accent/40">
            <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-accent/5 transition-transform group-hover:scale-150" />

            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 ring-1 ring-accent/20">
                <TrendingUp className="h-6 w-6 text-accent" />
              </div>

              <h3 className="mt-4 text-xl font-bold text-text-primary">
                I&apos;m a Trader
              </h3>
              <p className="mt-1 text-sm font-medium text-accent">
                Enter as a Player
              </p>

              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                You put real money on the line and you&apos;re tired of guessing
                who actually knows what they&apos;re talking about. Deepmint&apos;s
                AI cuts through the noise — rankings based on profit, not
                clout. Follow conviction, not charisma.
              </p>

              <ul className="mt-5 space-y-2.5">
                <li className="flex items-start gap-2 text-sm text-text-secondary">
                  <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>
                    AI-ranked leaderboards — sorted by who actually delivers
                  </span>
                </li>
                <li className="flex items-start gap-2 text-sm text-text-secondary">
                  <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>
                    Weighted consensus shows where the smartest money is pointing
                  </span>
                </li>
                <li className="flex items-start gap-2 text-sm text-text-secondary">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>
                    Connect your broker to verify trades and climb the ranks yourself
                  </span>
                </li>
              </ul>

              <Link
                href="/sign-up"
                className="mt-6 inline-flex items-center gap-2 rounded-lg border border-accent px-5 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-bg-primary"
              >
                Sign Up as a Player
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
