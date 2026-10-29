"use client";

/**
 * Acciones del dashboard por contexto activo.
 *
 * - PRIMARIA (una sola, en el header del dashboard):
 *     PERSONAL    → "Agregar vehículo" (/vehicles/new)
 *     WORKSHOP    → "Nueva atención" (/atenciones/nueva)
 *     DEALERSHIP  → sin acción propia (no existe alta de vehículo/atención
 *                   para concesionaria en este flujo — no se inventa ruta)
 * - SECUNDARIAS (las quick actions que ya existían — F-023 / D-105):
 *     WORKSHOP    → Atenciones · Verificaciones
 *     DEALERSHIP  → Ver vehículos · Miembros
 *
 * Todas las rutas son las MISMAS que usaba el dashboard anterior: cambia la
 * presentación, no los flujos.
 */

import Link from "next/link";
import { Car, FileText, Plus, Users, Wrench } from "lucide-react";
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
          <Button className="min-h-11 px-5">
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
