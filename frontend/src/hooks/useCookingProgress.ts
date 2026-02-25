import { useCallback, useEffect, useState } from "react";

type Method = "MANUAL" | "MACHINE";

function storageKey(recipeId: string, method: Method): string {
  return `cookless-cooking-${recipeId}-${method}`;
}

function loadStep(recipeId: string, method: Method, totalSteps: number): number {
  try {
    const saved = localStorage.getItem(storageKey(recipeId, method));
    if (saved === null) return 0;
    const step = parseInt(saved, 10);
    return step >= 0 && step < totalSteps ? step : 0;
  } catch {
    return 0;
  }
}

export function useCookingProgress(recipeId: string, method: Method, totalSteps: number) {
  const [currentStep, setCurrentStep] = useState(() =>
    loadStep(recipeId, method, totalSteps),
  );

  useEffect(() => {
    setCurrentStep(loadStep(recipeId, method, totalSteps));
  }, [recipeId, method, totalSteps]);

  const setStep = useCallback(
    (step: number) => {
      setCurrentStep(step);
      try {
        localStorage.setItem(storageKey(recipeId, method), step.toString());
      } catch {
        // localStorage unavailable
      }
    },
    [recipeId, method],
  );

  const clearProgress = useCallback(() => {
    setCurrentStep(0);
    try {
      localStorage.removeItem(storageKey(recipeId, method));
    } catch {
      // localStorage unavailable
    }
  }, [recipeId, method]);

  return { currentStep, setStep, clearProgress };
}
