"use client";

/**
 * TourLauncher — Componente genérico para lanzar un tour temático.
 *
 * El estado "tour visto" se lee ÚNICAMENTE de los flags de la sesión
 * (BD vía GET /auth/me). No se usa localStorage. Al completar, se llama al
 * endpoint PATCH /users/me/tour-complete y se refresca la sesión para que
 * el flag se actualice en el contexto.
 *
 * Uso:
 *   <TourLauncher tourId="branch" />
 *   <TourLauncher tourId="specialty" label="Ver guía" variant="ghost" />
 */

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { usersApi } from "@/lib/api";
import { useTour } from "./use-tour";
import {
  TOUR_REGISTRY,
  TOUR_FLAG_MAP,
  type TourId,
} from "@/lib/onboarding/tour-registry";

interface TourLauncherProps {
  tourId: TourId;
  /** Texto del botón (default: "Ver tutorial"). */
  label?: string;
  /** Variante del botón. */
  variant?: "default" | "outline" | "ghost" | "secondary";
  /** Tamaño del botón. */
  size?: "default" | "sm" | "lg" | "icon";
  /** Clases adicionales. */
  className?: string;
  /** Si true, muestra el botón aunque el tour ya se haya visto. */
  alwaysShow?: boolean;
  /** Si false, oculta el icono (útil para links de texto como "Ver guía"). */
  showIcon?: boolean;
}

export function TourLauncher({
  tourId,
  label = "Ver tutorial",
  variant = "outline",
  size = "sm",
  className,
  alwaysShow = false,
  showIcon = true,
}: TourLauncherProps) {
  const { user, refreshSession } = useAuth();
  const tourDef = TOUR_REGISTRY[tourId];
  const flagKey = TOUR_FLAG_MAP[tourId];

  // Flag de BD (sesión) + optimista local para feedback inmediato.
  const bdSeen = user
    ? Boolean((user as unknown as Record<string, boolean>)[flagKey])
    : false;
  const [localSeen, setLocalSeen] = useState(false);
  const seen = bdSeen || localSeen;
  const [shouldStart, setShouldStart] = useState(false);

  const handleComplete = useCallback(async () => {
    setLocalSeen(true);
    setShouldStart(false);
    try {
      await usersApi.completeTour(tourId);
      await refreshSession();
    } catch {
      // Si falla el API, mantenemos el estado optimista para no bloquear.
    }
  }, [tourId, refreshSession]);

  const { start, isActive } = useTour({
    steps: tourDef.steps,
    onComplete: handleComplete,
  });

  const handleLaunch = useCallback(() => {
    setShouldStart(true);
  }, []);

  // Si se forzó el inicio, arrancar el tour (el hook encola si el driver
  // todavía no se cargó).
  useEffect(() => {
    if (shouldStart && !isActive) {
      start();
    }
  }, [shouldStart, isActive, start]);

  // Si ya se vio y no es alwaysShow, no renderizar nada.
  if (!alwaysShow && seen) return null;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleLaunch}
      className={className}
    >
      {showIcon && <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />}
      {label}
    </Button>
  );
}
