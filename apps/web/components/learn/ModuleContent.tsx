"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, ChevronLeft, ChevronRight } from "lucide-react";
import type { LearnModule } from "@/lib/learnModules";
import Link from "next/link";

interface ModuleContentProps {
  module: LearnModule;
  completedSections: number[];
  quizScore: number | null;
  onMarkComplete: (sectionIndex: number) => void;
  onQuizComplete: (score: number) => void;
}

export function ModuleContent({
  module,
  completedSections,
  quizScore,
  onMarkComplete,
  onQuizComplete,
}: ModuleContentProps) {
  const [currentSection, setCurrentSection] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});

  const isLastSection = currentSection === module.sections.length - 1;
  const hasQuiz = module.quiz && module.quiz.length > 0;
  const allSectionsComplete =
    completedSections.length >= module.sections.length;

  function handleSubmitQuiz() {
    if (!module.quiz) return;
    let correct = 0;
    for (let i = 0; i < module.quiz.length; i++) {
      if (quizAnswers[i] === module.quiz[i].correctIndex) {
        correct++;
      }
    }
    const score = Math.round((correct / module.quiz.length) * 100);
    onQuizComplete(score);
  }

  if (showQuiz && hasQuiz) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-primary">Quiz</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowQuiz(false)}
            className="text-text-secondary"
          >
            Back to content
          </Button>
        </div>

        {quizScore !== null ? (
          <div className="rounded-lg border border-border bg-bg-secondary p-6 text-center">
            <p className="text-lg font-bold text-text-primary">
              Your Score: {quizScore}%
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {quizScore >= 80
                ? "Excellent work!"
                : quizScore >= 50
                  ? "Good effort. Review the sections to improve."
                  : "Consider reviewing the material and trying again."}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setQuizAnswers({});
                onQuizComplete(-1); // Reset
              }}
            >
              Retake Quiz
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {module.quiz!.map((q, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-border bg-bg-secondary p-4"
              >
                <p className="mb-3 font-medium text-text-primary">
                  {idx + 1}. {q.question}
                </p>
                <div className="space-y-2">
                  {q.options.map((option, optIdx) => (
                    <button
                      key={optIdx}
                      onClick={() =>
                        setQuizAnswers((prev) => ({ ...prev, [idx]: optIdx }))
                      }
                      className={`w-full rounded-md border px-4 py-2 text-left text-sm transition-colors ${
                        quizAnswers[idx] === optIdx
                          ? "border-accent bg-accent/10 text-text-primary"
                          : "border-border bg-bg-primary text-text-secondary hover:border-border-hover"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <Button
              onClick={handleSubmitQuiz}
              disabled={
                Object.keys(quizAnswers).length < (module.quiz?.length ?? 0)
              }
              className="w-full bg-accent text-bg-primary hover:bg-accent/90"
            >
              Submit Answers
            </Button>
          </div>
        )}
      </div>
    );
  }

  const section = module.sections[currentSection];
  const isSectionComplete = completedSections.includes(currentSection);

  return (
    <div className="space-y-6">
      {/* Section navigation */}
      <div className="flex flex-wrap gap-2">
        {module.sections.map((s, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentSection(idx)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
              idx === currentSection
                ? "bg-accent text-bg-primary"
                : completedSections.includes(idx)
                  ? "bg-green-500/10 text-green-500"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
            }`}
          >
            {completedSections.includes(idx) ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <Circle className="h-3 w-3" />
            )}
            {s.title}
          </button>
        ))}
        {hasQuiz && (
          <button
            onClick={() => setShowQuiz(true)}
            className="flex items-center gap-1.5 rounded-full bg-bg-tertiary px-3 py-1 text-xs text-text-secondary hover:text-text-primary"
          >
            {quizScore !== null && quizScore >= 0 ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <Circle className="h-3 w-3" />
            )}
            Quiz
            {quizScore !== null && quizScore >= 0 && (
              <Badge variant="outline" className="ml-1 text-xs border-green-500/30 text-green-500">
                {quizScore}%
              </Badge>
            )}
          </button>
        )}
      </div>

      {/* Section content */}
      <div className="rounded-lg border border-border bg-bg-secondary p-6">
        <h2 className="text-lg font-semibold text-text-primary">
          {section.title}
        </h2>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-text-secondary">
          {section.content.split("\n\n").map((paragraph, idx) => {
            if (paragraph.startsWith("**") && paragraph.endsWith("**")) {
              return (
                <p key={idx} className="font-semibold text-text-primary">
                  {paragraph.replace(/\*\*/g, "")}
                </p>
              );
            }
            // Handle inline bold
            const parts = paragraph.split(/(\*\*[^*]+\*\*)/g);
            return (
              <p key={idx}>
                {parts.map((part, pIdx) => {
                  if (part.startsWith("**") && part.endsWith("**")) {
                    return (
                      <strong key={pIdx} className="text-text-primary">
                        {part.replace(/\*\*/g, "")}
                      </strong>
                    );
                  }
                  return <span key={pIdx}>{part}</span>;
                })}
              </p>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={currentSection === 0}
          onClick={() => setCurrentSection((prev) => prev - 1)}
          className="border-border text-text-secondary"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>

        <div className="flex gap-2">
          {!isSectionComplete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onMarkComplete(currentSection)}
              className="border-accent text-accent"
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              Mark Complete
            </Button>
          )}

          {isLastSection ? (
            hasQuiz ? (
              <Button
                size="sm"
                onClick={() => setShowQuiz(true)}
                className="bg-accent text-bg-primary hover:bg-accent/90"
              >
                Take Quiz
              </Button>
            ) : (
              <Link href="/learn">
                <Button
                  size="sm"
                  className="bg-accent text-bg-primary hover:bg-accent/90"
                >
                  Back to Modules
                </Button>
              </Link>
            )
          ) : (
            <Button
              size="sm"
              onClick={() => {
                if (!isSectionComplete) onMarkComplete(currentSection);
                setCurrentSection((prev) => prev + 1);
              }}
              className="bg-accent text-bg-primary hover:bg-accent/90"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Module completion */}
      {allSectionsComplete && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 text-center">
          <CheckCircle2 className="mx-auto h-6 w-6 text-green-500" />
          <p className="mt-2 font-medium text-green-500">Module Complete!</p>
          <Link
            href="/learn"
            className="mt-1 text-sm text-text-secondary hover:text-accent"
          >
            Back to all modules
          </Link>
        </div>
      )}
    </div>
  );
}
