"use client";

/**
 * use-tour — envoltura sobre Driver.js para tours de onboarding bajo demanda.
 *
 * - Import dinámico de `driver.js` (manipula el DOM; no se ejecuta en el server).
 * - Los pasos se resuelven contra selectores `data-tour` del DOM real.
 * - Destruye el driver al desmontar (evita popovers huérfanos y listeners sueltos).
 * - Respeta `prefers-reduced-motion` y Escape (Driver.js ya los cubre por defecto,
 *   pero se expone `close()` para cerrar programáticamente).
 *
 * Uso:
 *   const { start, next, prev, close, isActive } = useTour({ steps, onComplete });
 *   <button onClick={() => start()}>Ver cómo</button>
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Instancia mínima de Driver.js (tipado estructural para evitar depender de sus tipos). */
interface DriverInstance {
  setSteps(steps: unknown[]): void;
  drive(): void;
  destroy(): void;
  moveNext(): void;
  movePrevious(): void;
}

interface UseTourProps {
  /** Pasos del tour (targets con `data-tour`). */
  steps: Array<{
    id: string;
    target: string;
    title: string;
    body: string;
    before?: () => void;
    optional?: boolean;
  }>;
  /** Se dispara cuando el usuario termina el tour (último paso). */
  onComplete?: () => void;
  /** Índice del paso inicial (default 0). */
  initialStep?: number;
}

export function useTour({ steps, onComplete, initialStep = 0 }: UseTourProps) {
  const driverRef = useRef<DriverInstance | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [driverLoaded, setDriverLoaded] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef(false);
  const pendingStartRef = useRef(false);
  const stepsRef = useRef(steps);

  // Mantener stepsRef actualizado.
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  // Mantener la referencia actualizada de onComplete.
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const destroy = useCallback(() => {
    if (driverRef.current) {
      try {
        driverRef.current.destroy();
      } catch {
        // ignore: driver ya destruido
      }
      driverRef.current = null;
    }
    setIsActive(false);
    setCurrentStep(initialStep);
  }, [initialStep]);

  // Carga Driver.js de forma dinámica solo en el client.
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      try {
        const mod = await import("driver.js");
        const driverFactory =
          (mod as { driver?: unknown }).driver ??
          (mod as { default?: unknown }).default;
        if (typeof driverFactory !== "function") {
          console.warn(
            "use-tour: driver.js no exportó 'driver' ni un default",
            Object.keys(mod ?? {}),
          );
          return;
        }
        // driver() es la factory; la llamamos para obtener la instancia.
        // Pasamos onDestroyStarted para detectar cuando el tour termina o se cierra.
        const instance = (driverFactory as (config?: unknown) => DriverInstance)({
          onDestroyed: () => {
            if (!completedRef.current) {
              completedRef.current = true;
              onCompleteRef.current?.();
            }
          },
        });
        if (!instance || typeof instance.setSteps !== "function") {
          console.warn("use-tour: la instancia de driver.js no tiene setSteps", Object.keys(instance ?? {}));
          return;
        }
        if (mounted) {
          driverRef.current = instance;
          setDriverLoaded(true);
          // Si había un start pendiente, ejecutarlo ahora.
          if (pendingStartRef.current) {
            pendingStartRef.current = false;
            // Llamar a start en el siguiente tick para asegurar que el estado se actualizó.
            setTimeout(() => {
              if (driverRef.current) {
                startInternal();
              }
            }, 0);
          }
        }
      } catch (err) {
        console.warn("use-tour: error al cargar driver.js", err);
      }
    })();
    return () => {
      mounted = false;
      destroy();
    };
  }, [destroy]);

  // Si los pasos cambian y el tour está activo, reiniciamos para evitar pasos huérfanos.
  useEffect(() => {
    if (driverRef.current && isActive && steps.length === 0) {
      destroy();
    }
  }, [steps.length, isActive, destroy]);

  const startInternal = useCallback(() => {
    if (!driverRef.current) return;
    // Resetear el flag de completado al iniciar un nuevo tour.
    completedRef.current = false;

    const currentSteps = stepsRef.current;

    // Filtra pasos opcionales cuyo target no existe en el DOM (evita que
    // Driver.js falle al intentar resaltar un elemento ausente en este rol).
    const availableSteps = currentSteps.filter((s) => {
      if (!s.optional) return true;
      return Boolean(document.querySelector(s.target));
    });

    if (availableSteps.length === 0) {
      console.warn("use-tour: no hay pasos disponibles en el DOM");
      return;
    }

    const driverSteps = availableSteps.map((s, index) => ({
      ...s,
      element: s.target,
      popover: {
        title: s.title,
        description: s.body,
        showButtons: ["next", "previous", "close"],
        nextBtnText: "Siguiente",
        prevBtnText: "Anterior",
        closeBtnText: "Cerrar",
      },
      onFocused: () => {
        s.before?.();
        setCurrentStep(index);
      },
    }));

    driverRef.current.setSteps(driverSteps);
    driverRef.current.drive();
    setIsActive(true);
    setCurrentStep(0);
  }, []);

  const start = useCallback(() => {
    if (!driverRef.current) {
      // Encolar el start para cuando el driver se cargue.
      pendingStartRef.current = true;
      return;
    }
    startInternal();
  }, [startInternal]);

  const next = useCallback(() => {
    if (!driverRef.current) return;
    driverRef.current.moveNext();
  }, []);

  const prev = useCallback(() => {
    if (!driverRef.current) return;
    driverRef.current.movePrevious();
  }, []);

  const close = useCallback(() => {
    if (driverRef.current) {
      // destroy() dispara onDestroyStarted → onComplete se llama desde ahí.
      destroy();
    } else if (!completedRef.current) {
      // El driver ya fue destruido (ej: al llegar al último paso).
      // Notificar onComplete si no se notificó ya.
      completedRef.current = true;
      onCompleteRef.current?.();
    }
  }, [destroy]);

  return {
    start,
    next,
    prev,
    close,
    isActive,
    currentStep,
    totalSteps: steps.length,
    markCompleted: () => onCompleteRef.current?.(),
  };
}
