"use client";

/**
 * Badge de estado de MEMBRESÍA (taller/concesionaria) para las secciones del
 * panel superadmin. Estados del contrato (MembershipStatus): pending | active
 * | inactive | suspended. Género: la membresía (femenino).
 */
import { Badge } from "@/components/ui/badge";

const STATUS_MAP: Record<
  string,
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  active: { label: "Activa", variant: "success" },
  pending: { label: "Pendiente", variant: "warning" },
  suspended: { label: "Suspendida", variant: "destructive" },
  inactive: { label: "Inactiva", variant: "secondary" },
};

export function MembershipStatusBadge({ status }: { status: string }) {
  const mapped = STATUS_MAP[status] ?? {
    label: status,
    variant: "secondary" as const,
  };
  return <Badge variant={mapped.variant}>{mapped.label}</Badge>;
}
