"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface OnboardingTourContextValue {
  /** Si el tour debe estar visible (forzado por "Repetir tour" o auto-start). */
  isTourVisible: boolean;
  /** Fuerza la apertura del tour (usa el botón "Repetir tour"). */
  showTour: () => void;
  /** Oculta el tour. */
  hideTour: () => void;
}

const OnboardingTourContext =
  createContext<OnboardingTourContextValue | null>(null);

export function OnboardingTourProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isTourVisible, setIsTourVisible] = useState(false);

  const showTour = useCallback(() => setIsTourVisible(true), []);
  const hideTour = useCallback(() => setIsTourVisible(false), []);

  return (
    <OnboardingTourContext.Provider
      value={{ isTourVisible, showTour, hideTour }}
    >
      {children}
    </OnboardingTourContext.Provider>
  );
}

export function useOnboardingTour(): OnboardingTourContextValue {
  const ctx = useContext(OnboardingTourContext);
  if (!ctx) {
    throw new Error(
      "useOnboardingTour must be used within an OnboardingTourProvider",
    );
  }
  return ctx;
}
