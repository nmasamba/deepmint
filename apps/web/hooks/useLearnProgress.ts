"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "deepmint:learn:progress";

interface ModuleProgress {
  completedSections: number[];
  quizScore: number | null;
}

type ProgressMap = Record<string, ModuleProgress>;

function loadProgress(): ProgressMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProgress(progress: ProgressMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function useLearnProgress() {
  const [progress, setProgress] = useState<ProgressMap>({});

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  const getProgress = useCallback(
    (moduleId: string): ModuleProgress => {
      return progress[moduleId] ?? { completedSections: [], quizScore: null };
    },
    [progress],
  );

  const markSectionComplete = useCallback(
    (moduleId: string, sectionIndex: number) => {
      setProgress((prev) => {
        const current = prev[moduleId] ?? {
          completedSections: [],
          quizScore: null,
        };
        if (current.completedSections.includes(sectionIndex)) return prev;
        const updated = {
          ...prev,
          [moduleId]: {
            ...current,
            completedSections: [...current.completedSections, sectionIndex],
          },
        };
        saveProgress(updated);
        return updated;
      });
    },
    [],
  );

  const setQuizScore = useCallback(
    (moduleId: string, score: number) => {
      setProgress((prev) => {
        const current = prev[moduleId] ?? {
          completedSections: [],
          quizScore: null,
        };
        const updated = {
          ...prev,
          [moduleId]: { ...current, quizScore: score },
        };
        saveProgress(updated);
        return updated;
      });
    },
    [],
  );

  const isModuleComplete = useCallback(
    (moduleId: string, totalSections: number): boolean => {
      const mod = progress[moduleId];
      if (!mod) return false;
      return mod.completedSections.length >= totalSections;
    },
    [progress],
  );

  return { getProgress, markSectionComplete, setQuizScore, isModuleComplete };
}
