import { GitFork, BrainCircuit, Flame } from "lucide-react";

const steps = [
  {
    icon: GitFork,
    title: "Choose Your Path",
    description:
      "Sign up as a Guide and put your calls on the record — or join as a Player to follow the sharpest minds and build your own edge. Two lanes, one scoreboard.",
  },
  {
    icon: BrainCircuit,
    title: "AI Scores the Outcome",
    description:
      "When the clock runs out, predictive AI grades every call against real market data. Accuracy, timing, conviction — nothing hides from the algorithm.",
  },
  {
    icon: Flame,
    title: "The Best Rise the Ranks",
    description:
      "AI-weighted leaderboards separate the signal from the noise. No bought followers, no cherry-picked wins. Just cold, audited performance — and the analysts who own it.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-t border-border/50 px-4 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-2xl font-bold text-text-primary sm:text-3xl">
          How It Works
        </h2>
        <p className="mt-2 text-center text-text-secondary">
          Three moves. Zero places to hide.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-border/40 bg-bg-secondary/60 p-6 text-center backdrop-blur-sm"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20">
                <step.icon className="h-7 w-7 text-accent" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-text-primary">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
