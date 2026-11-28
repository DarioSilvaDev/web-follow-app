"use client";

/**
 * Acciones del dashboard por contexto activo.
 *
 * - PRIMARIA (una sola, en el header del dashboard):
 *     PERSONAL    → "Agregar vehículo" (/vehicles/new)
 *     WORKSHOP    → "Nueva atención" (/atenciones/nueva)
 *     DEALERSHIP  → sin acción propia (no existe alta de vehículo/atención
 *                   para concesionaria en este flujo — no se inventa ruta)
 * - SECUNDARIAS (las quick actions que ya existían — F-023 / D-105;
 *   + Reclamos de F-2):
 *     WORKSHOP    → Atenciones · Verificaciones · Reclamos
 *     DEALERSHIP  → Ver vehículos · Miembros
 *
 * Todas las rutas son las MISMAS que usaba el dashboard anterior: cambia la
 * presentación, no los flujos.
 */

import Link from "next/link";
import { Car, FileText, Link2, Plus, Users, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveContext } from "@/hooks/use-active-context";
import { cn } from "cn";

interface DashboardAction {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface DashboardActionsProps {
  className?: string;
}

export function DashboardActions({ className }: DashboardActionsProps) {
  const activeContext = useActiveContext();
  const isWorkshop = activeContext?.type === "WORKSHOP";
  const isDealership = activeContext?.type === "DEALERSHIP";

  const primary: DashboardAction | null = isWorkshop
    ? { href: "/atenciones/nueva", label: "Nueva atención", icon: Wrench }
    : isDealership
      ? null
      : { href: "/vehicles/new", label: "Agregar vehículo", icon: Plus };

  const secondary: DashboardAction[] = [];
  if (isWorkshop) {
    secondary.push(
      { href: "/atenciones", label: "Atenciones", icon: FileText },
      {
        href: "/atenciones/verificaciones",
        label: "Verificaciones",
        icon: FileText,
      },
      // F-2: acceso al listado de reclamos del taller (sin nav item —
      // decisión derivada, flag en el reporte). La página maneja su propio
      // estado sin permiso (§2.14).
      { href: "/reclamos", label: "Reclamos", icon: Link2 },
    );
  }
  if (isDealership && activeContext?.type === "DEALERSHIP") {
    secondary.push(
      { href: "/vehicles", label: "Ver vehículos", icon: Car },
      {
        href: `/dealerships/${activeContext.dealershipId}?tab=members`,
        label: "Miembros",
        icon: Users,
      },
    );
  }

  if (!primary && secondary.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {primary && (
        <Link href={primary.href}>
          <Button
            className="min-h-11 px-5"
            data-tour="dashboard-nueva-atencion"
          >
            <primary.icon className="mr-1.5" aria-hidden="true" />
            {primary.label}
          </Button>
        </Link>
      )}
      {secondary.map((action) => (
        <Link key={action.href} href={action.href}>
          <Button variant="outline" size="sm">
            <action.icon className="mr-1.5" aria-hidden="true" />
            {action.label}
          </Button>
        </Link>
      ))}
    </div>
  );
}
