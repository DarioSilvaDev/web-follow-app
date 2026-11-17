import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Badge } from "./badge";

/**
 * StatusBadge — estado de un servicio o de un vehículo (Design System).
 *
 * Envuelve `Badge` para que el mismo estado se vea igual en toda la app y el
 * texto salga de un único lugar. Solo se listan estados que HOY existen en el
 * dominio (care-episode, verificación, transferencias/claims y estado de
 * entidad). Agregar uno nuevo requiere validación de PM.
 *
 * Accesibilidad:
 * - El estado nunca depende del color: hay texto + icono.
 * - Pill tintado (fondo `-12%`, borde `-40%`, texto `foreground`) en lugar de
 *   fondo sólido: medido sobre la paleta de marca da ≥12:1 en light y dark
 *   (AA exige 4.5:1). El pill sólido de `success` con texto blanco daba 3.39:1
 *   y por eso no se usa acá.
 *
 * El texto se renderiza como nodo hijo directo del `Badge` (sin `<span>`), así
 * los tests que verifican clases sobre el texto visible siguen funcionando.
 */
export type StatusTone = "success" | "info" | "warning" | "destructive" | "neutral";

export type StatusKey =
  | "open"
  | "delivered"
  | "cancelled"
  | "verified"
  | "unverified"
  | "rejected"
  | "pending"
  | "active"
  | "inactive";

interface StatusDefinition {
  label: string;
  tone: StatusTone;
  icon: LucideIcon;
}

export const STATUS_DEFINITIONS: Record<StatusKey, StatusDefinition> = {
  open: { label: "Abierto", tone: "info", icon: CircleDashed },
  delivered: { label: "Entregado", tone: "success", icon: CircleCheck },
  cancelled: { label: "Cancelado", tone: "destructive", icon: CircleX },
  verified: { label: "Verificado", tone: "success", icon: ShieldCheck },
  unverified: {
    label: "Registrado por el propietario",
    tone: "neutral",
    icon: ShieldQuestion,
  },
  rejected: { label: "Rechazado", tone: "destructive", icon: ShieldAlert },
  pending: { label: "Pendiente", tone: "warning", icon: Clock },
  active: { label: "Activo", tone: "success", icon: CircleCheck },
  inactive: { label: "Inactivo", tone: "neutral", icon: CircleX },
};

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "border-success/40 bg-success/12 text-foreground [&_svg]:text-success",
  info: "border-info/40 bg-info/12 text-foreground [&_svg]:text-info",
  warning: "border-warning/50 bg-warning/15 text-foreground [&_svg]:text-warning",
  destructive:
    "border-destructive/40 bg-destructive/10 text-foreground [&_svg]:text-destructive",
  neutral: "border-border bg-muted text-secondary-foreground",
};

/** Variante base de `Badge` por tono (fallback si el tint no aplica). */
const TONE_VARIANT: Record<
  StatusTone,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  success: "success",
  info: "info",
  warning: "warning",
  destructive: "destructive",
  neutral: "secondary",
};

export interface StatusBadgeProps {
  status: StatusKey;
  /** Override del texto visible (ej. "Rechazado por {taller}"). */
  label?: React.ReactNode;
  /** Oculta el icono en espacios muy densos (el texto sigue siendo la señal). */
  hideIcon?: boolean;
  className?: string;
}

function StatusBadge({
  status,
  label,
  hideIcon = false,
  className,
}: StatusBadgeProps) {
  const definition = STATUS_DEFINITIONS[status];
  const Icon = definition.icon;

  return (
    <Badge
      variant={TONE_VARIANT[definition.tone]}
      className={cn(
        "gap-1.5 py-1 font-semibold",
        TONE_CLASSES[definition.tone],
        className,
      )}
    >
      {hideIcon ? null : (
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      {/* El texto va como hijo directo (sin <span>) a propósito: así el nodo
          que matchea `getByText` es el propio Badge y sus clases de tono
          siguen siendo verificables desde los tests. */}
      {label ?? definition.label}
    </Badge>
  );
}

export { StatusBadge };
