"use client";

import { LEARN_MODULES } from "@/lib/learnModules";
import { ModuleCard } from "@/components/learn/ModuleCard";
import { useLearnProgress } from "@/hooks/useLearnProgress";
import { GraduationCap } from "lucide-react";

export default function LearnPage() {
  const { getProgress } = useLearnProgress();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <GraduationCap className="h-7 w-7 text-accent" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Learn</h1>
          <p className="text-text-secondary">
            Learn how AI scores analysts, reads track records, and surfaces alpha.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {LEARN_MODULES.map((module) => {
          const progress = getProgress(module.id);
          return (
            <ModuleCard
              key={module.id}
              module={module}
              completedSections={progress.completedSections.length}
              totalSections={module.sections.length}
            />
          );
        })}
      </div>
    </div>
  );
}
