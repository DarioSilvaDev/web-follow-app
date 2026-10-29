"use client";

/**
 * Chip de contexto activo en el header del dashboard.
 *
 * Reemplaza al ContextSelector (select) — decisión de UX: el contexto ya no
 * se elige con un dropdown en el header; se activa al entrar a un taller o
 * concesionaria (`useRouteDerivedContext`) y se desactiva con la ✕ de este
 * chip. El chip es SOLO indicador + salida a PERSONAL:
 *
 * - Se renderiza únicamente con contexto activo (WORKSHOP/DEALERSHIP);
 *   en PERSONAL no renderiza nada (el journey personal es el default).
 * - El nombre se resuelve desde las membresías de la sesión
 *   (`SessionUser.workshopMemberships` / `dealershipMemberships`); si la
 *   sesión aún no lo expone, fallback "Taller activo" / "Concesionaria
 *   activa".
 * - ✕ → `clearActiveContext()`: el ÚNICO modo manual de volver a PERSONAL
 *   (además del logout). Si el usuario está EN la ruta detalle del contexto
 *   que limpia (`/dealerships/<uuid>` o `/workshops/<uuid>`), además limpia
 *   y navega al listado correspondiente — quedarse en la detalle en PERSONAL
 *   re-activaría el contexto (el hook de ruta lo re-deriva). No es security
 *   boundary: el backend valida cada request (AGENTS.md §5).
 * - Target táctil ≥ 32px (40px en mobile vía responsive).
 */

import { Building2, Wrench, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import { matchRouteContext } from "@/hooks/use-route-derived-context";
import { clearActiveContext } from "@/lib/active-context";

export function ContextChip() {
  const { user } = useAuth();
  const activeContext = useActiveContext();
  const pathname = usePathname();
  const router = useRouter();

  if (!activeContext) {
    return null;
  }

  const isWorkshop = activeContext.type === "WORKSHOP";
  const name = isWorkshop
    ? user?.workshopMemberships?.find(
        (membership) =>
          membership.workshopId === activeContext.workshopId,
      )?.workshop.name
    : user?.dealershipMemberships?.find(
        (membership) =>
          membership.dealershipId === activeContext.dealershipId,
      )?.dealershipName;

  const label = isWorkshop ? "Taller" : "Concesionaria";
  const fallback = isWorkshop ? "Taller activo" : "Concesionaria activa";
  const Icon = isWorkshop ? Wrench : Building2;
  const text = name ? `${label}: ${name}` : fallback;

  // ✕ en ruta detalle del contexto que se limpia → limpiar + navegar al
  // listado (afordance "Volver a…"): en la detalle en PERSONAL el hook de
  // ruta re-activaría el contexto y el usuario quedaría varado sin acceso.
  // En cualquier otra ruta, solo limpia.
  const handleClear = () => {
    clearActiveContext();
    const route = matchRouteContext(pathname);
    if (
      route?.type === "WORKSHOP" &&
      activeContext.type === "WORKSHOP" &&
      route.id === activeContext.workshopId
    ) {
      router.push("/workshops");
    } else if (
      route?.type === "DEALERSHIP" &&
      activeContext.type === "DEALERSHIP" &&
      route.id === activeContext.dealershipId
    ) {
      router.push("/dealerships");
    }
  };

  return (
    <span
      data-testid="context-chip"
      title={text}
      className="inline-flex min-w-0 max-w-[190px] items-center gap-1 rounded-full border bg-muted/60 py-0.5 pl-2.5 pr-1 text-xs md:max-w-[280px]"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 truncate font-medium text-foreground">
        {text}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleClear}
        aria-label="Limpiar contexto activo"
        className="h-10 w-10 shrink-0 rounded-full md:h-8 md:w-8"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </span>
  );
}
