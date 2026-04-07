"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { LEARN_MODULES } from "@/lib/learnModules";
import { ModuleContent } from "@/components/learn/ModuleContent";
import { useLearnProgress } from "@/hooks/useLearnProgress";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronLeft } from "lucide-react";
import Link from "next/link";

interface ModulePageProps {
  params: Promise<{ moduleId: string }>;
}

export default function ModulePage({ params }: ModulePageProps) {
  const { moduleId } = use(params);
  const module = LEARN_MODULES.find((m) => m.id === moduleId);

  const { getProgress, markSectionComplete, setQuizScore } =
    useLearnProgress();

  if (!module) {
    notFound();
  }

  const progress = getProgress(module.id);

  const difficultyColor = {
    beginner: "border-green-500/30 text-green-500",
    intermediate: "border-amber-500/30 text-amber-500",
    advanced: "border-red-500/30 text-red-500",
  }[module.difficulty];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/learn"
          className="mb-3 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-accent"
        >
          <ChevronLeft className="h-4 w-4" />
          All Modules
        </Link>
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-bg-tertiary p-3">
            <module.icon className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              {module.title}
            </h1>
            <div className="mt-2 flex items-center gap-3">
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
              <span className="text-xs text-text-secondary">
                {module.sections.length} sections
                {module.quiz ? ` + quiz` : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <ModuleContent
        module={module}
        completedSections={progress.completedSections}
        quizScore={progress.quizScore}
        onMarkComplete={(sectionIndex) =>
          markSectionComplete(module.id, sectionIndex)
        }
        onQuizComplete={(score) => setQuizScore(module.id, score)}
      />
    </div>
  );
}
