"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import type { LearnModule } from "@/lib/learnModules";

interface ModuleCardProps {
  module: LearnModule;
  completedSections: number;
  totalSections: number;
}

export function ModuleCard({
  module,
  completedSections,
  totalSections,
}: ModuleCardProps) {
  const Icon = module.icon;
  const progress =
    totalSections > 0
      ? Math.round((completedSections / totalSections) * 100)
      : 0;
  const isComplete = completedSections >= totalSections;

  const difficultyColor = {
    beginner: "border-green-500/30 text-green-500",
    intermediate: "border-amber-500/30 text-amber-500",
    advanced: "border-red-500/30 text-red-500",
  }[module.difficulty];

  return (
    <Link
      href={`/learn/${module.id}`}
      className="group rounded-lg border border-border bg-bg-secondary p-5 transition-colors hover:border-accent/50"
    >
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-bg-tertiary p-2.5">
          <Icon className="h-5 w-5 text-accent" />
        </div>
        <div className="flex-1 space-y-2">
          <h3 className="font-semibold text-text-primary group-hover:text-accent transition-colors">
            {module.title}
          </h3>
          <p className="text-sm text-text-secondary line-clamp-2">
            {module.description}
          </p>

          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={`text-xs capitalize ${difficultyColor}`}
            >
              {module.difficulty}
            </Badge>
            <div className="flex items-center gap-1 text-xs text-text-secondary">
              <Clock className="h-3 w-3" />
              {module.estimatedMinutes} min
            </div>
          </div>

          {/* Progress bar */}
          <div className="pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">
                {isComplete
                  ? "Completed"
                  : completedSections > 0
                    ? `${completedSections}/${totalSections} sections`
                    : "Not started"}
              </span>
              {progress > 0 && (
                <span className="font-mono text-text-secondary">
                  {progress}%
                </span>
              )}
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg-primary">
              <div
                className={`h-full rounded-full transition-all ${
                  isComplete ? "bg-green-500" : "bg-accent"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
