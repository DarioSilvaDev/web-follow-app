"use client";

/**
 * Contexto activo derivado de la ruta + guard de membresía global
 * (reemplaza al ContextSelector del header, decisión de UX: navegación por
 * secciones en vez de selector).
 *
 * Precedencia al sincronizar el store en cada `pathname`:
 *   ruta explícita > contexto persistido > PERSONAL.
 *
 * - `/dealerships/<uuid>` → `selectDealership(uuid)`
 * - `/workshops/<uuid>`   → `selectWorkshop(uuid)`
 * - Cualquier otra ruta (listados, dashboard, atenciones, vehicles,
 *   transferencias, profile, `/dealerships/nueva`, etc.) → NO altera el
 *   contexto vigente (que puede venir hidratado de `sessionStorage`, D-021).
 *
 * Guard de membresía (una sola fuente, cualquier ruta):
 * - Antes de setear, el id de ruta se valida contra las membresías de la
 *   sesión (`user.dealershipMemberships` / `user.workshopMemberships`).
 * - Además, en CUALQUIER ruta se valida el contexto vigente (incluido el
 *   persistido): si ya no está entre las membresías del usuario (membresía
 *   revocada o storage de otro usuario) se limpia. Esto cubre rutas no-detalle
 *   (ej. `/vehicles/new` con DEALERSHIP persistido de una membresía revocada).
 * - No setear ni limpiar mientras la sesión está `loading` (evita clears
 *   falsos durante el bootstrap).
 * - Sesión `unauthenticated` ⇒ PERSONAL: no hay membresías que validar.
 *
 * El backend es la frontera real de enforcement (AGENTS.md §5); este guard es
 * solo UX y evita arrastrar un contexto que el backend rechazaría con 403.
 *
 * - Regex estricta de UUID: evita matchear `/dealerships/nueva` u otras
 *   subrutas con segmento no-uuid.
 * - El flujo QR imperativo (`selectDealership` en /transfer/qr/[token]) queda
 *   intacto: corre fuera del layout (dashboard) donde se monta este hook y el
 *   backend valida la membresía al confirmar (RB-02).
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/types/auth";
import { useAuth } from "@/hooks/use-auth";
import {
  clearActiveContext,
  getActiveContext,
  selectDealership,
  selectWorkshop,
  type ActiveContext,
} from "@/lib/active-context";

/** UUID v4 estricto (hex 8-4-4-4-12). Evita falsos positivos en subrutas. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext =
  | { type: "DEALERSHIP"; id: string }
  | { type: "WORKSHOP"; id: string };

/**
 * Extrae el contexto explícito de la ruta, si existe. Solo los detalles
 * `/dealerships/<uuid>` y `/workshops/<uuid>` definen contexto; el resto
 * de las rutas devuelven `null` (no alteran el contexto vigente).
 */
export function matchRouteContext(pathname: string): RouteContext | null {
  const dealershipMatch = /^\/dealerships\/([^/]+)$/.exec(pathname);
  if (dealershipMatch && UUID_RE.test(dealershipMatch[1])) {
    return { type: "DEALERSHIP", id: dealershipMatch[1] };
  }
  const workshopMatch = /^\/workshops\/([^/]+)$/.exec(pathname);
  if (workshopMatch && UUID_RE.test(workshopMatch[1])) {
    return { type: "WORKSHOP", id: workshopMatch[1] };
  }
  return null;
}

/**
 * ¿El contexto está respaldado por una membresía de la sesión actual?
 * Sin usuario/sesión no hay membresía válida. Usado tanto para el contexto
 * de ruta como para el persistido (D-021: anti-contexto stale/robado).
 */
export function contextBelongsToSession(
  context: ActiveContext,
  user: SessionUser | null,
): boolean {
  if (!context || !user) {
    return false;
  }
  return context.type === "WORKSHOP"
    ? (user.workshopMemberships ?? []).some(
        (membership) => membership.workshopId === context.workshopId,
      )
    : (user.dealershipMemberships ?? []).some(
        (membership) => membership.dealershipId === context.dealershipId,
      );
}

function toActiveContext(route: RouteContext): ActiveContext {
  return route.type === "DEALERSHIP"
    ? { type: "DEALERSHIP", dealershipId: route.id }
    : { type: "WORKSHOP", workshopId: route.id };
}

export function useRouteDerivedContext(): void {
  const pathname = usePathname();
  const { status, user } = useAuth();

  useEffect(() => {
    // Bootstrap: sin membresías cargadas no se puede validar nada.
    if (status === "loading") {
      return;
    }

    // Sesión perdida (refresh fallido / logout en otra vía) ⇒ PERSONAL.
    if (status === "unauthenticated") {
      clearActiveContext();
      return;
    }

    // Guard global: el contexto vigente (incluido el hidratado de
    // sessionStorage) debe seguir respaldado por una membresía actual.
    const current = getActiveContext();
    if (current && !contextBelongsToSession(current, user)) {
      clearActiveContext();
    }

    const route = matchRouteContext(pathname);
    if (!route) {
      // Ruta sin contexto explícito → el contexto vigente se conserva.
      return;
    }

    const routeContext = toActiveContext(route);
    if (!contextBelongsToSession(routeContext, user)) {
      // Membresía revocada / id ajeno → PERSONAL (evita 403 stale).
      clearActiveContext();
      return;
    }

    if (routeContext?.type === "DEALERSHIP") {
      selectDealership(routeContext.dealershipId);
    } else if (routeContext?.type === "WORKSHOP") {
      selectWorkshop(routeContext.workshopId);
    }
  }, [pathname, status, user]);
}
