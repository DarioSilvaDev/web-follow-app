"use client";

/**
 * Acordeón de secciones para formularios largos (check-in, alta de vehículo,
 * alta de servicio del propietario).
 *
 * Mismo lenguaje visual que el check-in (B-2):
 * - Cada sección es una tarjeta independiente (borde, radio `card`, sombra
 *   `shadow-card`); el root solo aporta layout (`grid gap-3`).
 * - Cerrada = superficie `card` (blanco). Abierta = la tarjeta entera se
 *   tiñe de `secondary` (celeste) y el cuerpo queda transparente, dejando
 *   ver el tinte; los controles del cuerpo (inputs, chips, fieldsets) son
 *   blancos: el contraste de fondos es parte del diseño.
 * - Encabezado (trigger): círculo de estado + título + estado textual
 *   ("Incompleta"/"Completa"/"Opcional") + chevron que rota. El estado no
 *   depende solo del color: el texto lo comunica.
 *
 * `status`:
 * - `complete`   → círculo `success` + "Completa".
 * - `incomplete` → círculo `warning` + "Incompleta".
 * - `optional`   → círculo neutro   + "Opcional" (secciones que no bloquean).
 *
 * Secciones abiertas: un solo panel a la vez. Al abrir una sección desde la
 * navegación, las demás quedan cerradas (solo permanece abierta la sección
 * seleccionada).
 */
import type { ReactNode } from "react";
import { ChevronDown, CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";

export type SectionStatus = "complete" | "incomplete" | "optional";

export const FORM_SECTION_ITEM_CLASS = cn(
  "min-w-0 overflow-hidden rounded-card border border-border bg-card shadow-card",
  "transition-colors duration-normal",
  "hover:border-primary/20",
  "data-[open]:border-primary/25 data-[open]:bg-secondary",
);

/**
 * Cuerpo abierto: transparente (deja ver el tinte `secondary` de la tarjeta)
 * con un divisor teñido de `primary`.
 */
export const FORM_SECTION_PANEL_CLASS = "border-primary/15 bg-transparent";

export function FormSectionAccordion({
  value,
  onValueChange,
  children,
}: {
  value: string[];
  onValueChange: (value: string[]) => void;
  children: ReactNode;
}) {
  return (
    <Accordion
      value={value}
      onValueChange={onValueChange}
      className="grid gap-3"
    >
      {children}
    </Accordion>
  );
}

const STATUS_CIRCLE: Record<SectionStatus, string> = {
  complete: "bg-success/15 text-success",
  incomplete: "bg-warning/15 text-warning",
  optional: "bg-muted text-muted-foreground",
};

const STATUS_TEXT: Record<SectionStatus, string> = {
  complete: "text-success",
  incomplete: "text-muted-foreground",
  optional: "text-muted-foreground",
};

const STATUS_LABEL: Record<SectionStatus, string> = {
  complete: "Completa",
  incomplete: "Incompleta",
  optional: "Opcional",
};

function StatusIcon({ status }: { status: SectionStatus }) {
  const className = "size-5";
  if (status === "complete") {
    return <CircleCheck className={className} strokeWidth={2.1} />;
  }
  if (status === "incomplete") {
    return <TriangleAlert className={className} strokeWidth={2.1} />;
  }
  return <CircleDashed className={className} strokeWidth={2.1} />;
}

/**
 * Sección del formulario: tarjeta + trigger (círculo de estado, título,
 * estado textual, chevron rotante) + panel (`description` opcional como
 * texto de apoyo y los controles del cuerpo debajo).
 */
export function FormSection({
  value,
  title,
  status,
  description,
  children,
}: {
  value: string;
  title: string;
  status: SectionStatus;
  /** Texto de apoyo (gris, chico) arriba del cuerpo de la sección. */
  description?: string;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value} className={FORM_SECTION_ITEM_CLASS}>
      <AccordionHeader>
        <AccordionTrigger
          className={cn(
            "items-center gap-3 px-4 py-3.5 duration-normal",
            // Cerrada (blanca): hover apenas teñido. Abierta: transparente,
            // rige el tinte `secondary` de la tarjeta completa.
            "hover:bg-muted/50",
            "data-[panel-open]:bg-transparent data-[panel-open]:hover:bg-transparent",
          )}
        >
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              "transition-colors duration-normal",
              STATUS_CIRCLE[status],
            )}
            aria-hidden="true"
          >
            <StatusIcon status={status} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold leading-snug text-foreground">
              {title}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                STATUS_TEXT[status],
              )}
            >
              {STATUS_LABEL[status]}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="ml-auto size-[18px] shrink-0 text-muted-foreground transition-transform duration-normal group-data-[panel-open]:rotate-180"
          />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel className={FORM_SECTION_PANEL_CLASS}>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {children}
      </AccordionPanel>
    </AccordionItem>
  );
}
