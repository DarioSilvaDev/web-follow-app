/**
 * Persistencia del onboarding del taller (Fase 3).
 *
 * Claves versionadas por usuario + taller para que el progreso no se mezcle
 * entre usuarios ni entre talleres de un usuario híbrido. El valor es un
 * JSON simple: los ids de los ítems del checklist ya marcados como completos.
 *
 * localStorage es la única fuente de verdad del frontend; el backend no conoce
 * este estado (el checklist es informativo, nunca bloquea).
 */

export const ONBOARDING_STORAGE_VERSION = "v1";

/** Clave de localStorage para el progreso del onboarding de un usuario en un taller. */
export function onboardingStorageKey(
  userId: string,
  workshopId: string,
): string {
  return `autentia:onboarding:${ONBOARDING_STORAGE_VERSION}:${userId}:${workshopId}`;
}

export interface OnboardingProgress {
  /** ids de ítems del checklist marcados como completados. */
  completedItemIds: string[];
  /** Último paso del tour visto (para no repetir el mismo tour en cada login). */
  lastCompletedTourStep?: number;
}

/** Lee el progreso guardado (devuelve vacío si no hay nada ni sin usuario). */
export function readOnboardingProgress(
  userId: string | undefined,
  workshopId: string,
): OnboardingProgress {
  if (!userId || typeof window === "undefined" || !window.localStorage) {
    return { completedItemIds: [] };
  }

  try {
    const raw = window.localStorage.getItem(
      onboardingStorageKey(userId, workshopId),
    );
    if (!raw) return { completedItemIds: [] };
    const parsed = JSON.parse(raw) as OnboardingProgress;
    return {
      completedItemIds: Array.isArray(parsed.completedItemIds)
        ? parsed.completedItemIds
        : [],
      lastCompletedTourStep: parsed.lastCompletedTourStep,
    };
  } catch {
    return { completedItemIds: [] };
  }
}

/** Guarda el progreso (mezcla con lo existente para no perder ítems). */
export function writeOnboardingProgress(
  userId: string | undefined,
  workshopId: string,
  progress: Partial<OnboardingProgress>,
): void {
  if (!userId || typeof window === "undefined" || !window.localStorage) return;

  const current = readOnboardingProgress(userId, workshopId);
  const next: OnboardingProgress = {
    completedItemIds: [
      ...new Set([
        ...current.completedItemIds,
        ...(progress.completedItemIds ?? []),
      ]),
    ],
    lastCompletedTourStep:
      progress.lastCompletedTourStep ?? current.lastCompletedTourStep,
  };

  window.localStorage.setItem(
    onboardingStorageKey(userId, workshopId),
    JSON.stringify(next),
  );
}

/** Marca un ítem del checklist como completado (idempotente). */
export function completeOnboardingItem(
  userId: string | undefined,
  workshopId: string,
  itemId: string,
): void {
  if (!userId) return;
  writeOnboardingProgress(userId, workshopId, { completedItemIds: [itemId] });
}

/** Borra todo el progreso de onboarding de un usuario en un taller (útil para tests / "Repetir tour"). */
export function resetOnboardingProgress(
  userId: string | undefined,
  workshopId: string,
): void {
  if (!userId || typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(onboardingStorageKey(userId, workshopId));
}
