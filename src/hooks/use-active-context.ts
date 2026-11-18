"use client";

import { useSyncExternalStore } from "react";
import {
  getActiveContextServerSnapshot,
  getActiveContextSnapshot,
  subscribeActiveContext,
  type ActiveContext,
} from "@/lib/active-context";

/**
 * Lee el contexto activo con suscripción a cambios (re-render al seleccionar
 * taller/concesionaria, al limpiarlo y al hidratar el valor persistido en
 * `sessionStorage`). F-020 / P2-6; persistencia UX D-021.
 *
 * `null` = PERSONAL (default); `{ type: "WORKSHOP", workshopId }` = taller;
 * `{ type: "DEALERSHIP", dealershipId }` = concesionaria.
 *
 * El tercer argumento es el *server snapshot*: debe ser `null` (no el snapshot
 * de cliente) para que la hidratación use el markup SSR en PERSONAL y React
 * re-renderice después con el contexto persistido, sin hydration mismatch.
 */
export function useActiveContext(): ActiveContext {
  return useSyncExternalStore(
    subscribeActiveContext,
    getActiveContextSnapshot,
    getActiveContextServerSnapshot,
  );
}
