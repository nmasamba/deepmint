"use client";

import { trpc } from "@/lib/trpc";

export function SocialProof() {
  const { data } = trpc.entity.stats.useQuery(undefined, {
    staleTime: 60_000,
  });

  const stats = [
    {
      label: "Predictions Tracked",
      value: data?.claimsCount ?? 0,
    },
    {
      label: "AI-Scored Outcomes",
      value: data?.outcomesCount ?? 0,
    },
    {
      label: "Guides & Players",
      value: data?.entitiesCount ?? 0,
    },
  ];

  return (
    <section className="border-y border-border/50 bg-bg-secondary/80 px-4 py-16">
      <div className="mx-auto max-w-4xl">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-mono text-3xl font-bold text-accent drop-shadow-[0_0_12px_rgba(52,211,153,0.25)]">
                {stat.value.toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-text-secondary">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
