/**
 * Completitud del perfil del taller — lógica pura y derivada
 * (DECISION-REGISTER PROD-004 / FR-006).
 *
 * El checklist NO es un campo de la base de datos: se calcula a partir de los
 * datos que `GET /workshops/:id` ya devuelve. Módulo puro (sin React, sin fetch)
 * para poder testearlo de forma aislada.
 *
 * El checklist es INFORMATIVO: no bloquea ninguna operación. La única
 * excepción, deliberada y preexistente, es el requisito de al menos una
 * sucursal activa para registrar una atención (`/atenciones/nueva`), que vive
 * en esa pantalla y no acá.
 *
 * Accesibilidad: el significado se transmite con ícono + texto + borde, nunca
 * solo con color (WCAG 1.4.1).
 */

import type { WorkshopBranch, WorkshopDetail } from "@/types/workshop";

export interface CompletenessItem {
  id: string;
  label: string;
  /**
   * Copy de lo que falta. Se declara siempre (así el dato queda disponible
   * para cualquier consumidor: card, wizard, emails), pero la UI debe
   * mostrarlo únicamente cuando `complete` es `false`.
   */
  hint: string;
  complete: boolean;
  /** Ancla de la sección donde el usuario puede completar el ítem. */
  section: "datos" | "sucursales";
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Ítems del checklist, derivados de un `WorkshopDetail`.
 * `branches` puede venir `undefined` (el PATCH devuelve la entidad sin
 * branches embebidas) — se trata como lista vacía y el ítem de sede queda
 * pendiente, que es el estado correcto a la vista.
 */
export function computeWorkshopCompleteness(
  workshop: Pick<
    WorkshopDetail,
    "email" | "phone" | "website" | "description" | "legalName" | "taxId"
  > & { branches?: WorkshopBranch[] },
): CompletenessItem[] {
  const branches = workshop.branches ?? [];
  const headquarters = branches.find((branch) => branch.isHeadquarters);

  return [
    {
      id: "contact",
      label: "Datos de contacto",
      hint: "Cargá el email y el teléfono del taller.",
      complete: nonEmpty(workshop.email) && nonEmpty(workshop.phone),
      section: "datos",
    },
    {
      id: "website",
      label: "Sitio web",
      hint: "Cargá el sitio web del taller, si tiene.",
      complete: nonEmpty(workshop.website),
      section: "datos",
    },
    {
      id: "description",
      label: "Descripción",
      hint: "Contá qué hace el taller. Tus clientes lo ven.",
      complete: nonEmpty(workshop.description),
      section: "datos",
    },
    {
      id: "legal-identity",
      label: "Razón social o CUIT",
      hint: "Cargá la razón social o el CUIT del taller.",
      complete: nonEmpty(workshop.legalName) || nonEmpty(workshop.taxId),
      section: "datos",
    },
    {
      id: "headquarters",
      label: "Sucursal sede",
      hint: "Agregá al menos una sucursal para poder registrar atenciones.",
      complete: branches.length > 0 && Boolean(headquarters),
      section: "sucursales",
    },
    {
      id: "headquarters-contact",
      label: "Contacto de la sede",
      hint: "Cargá el teléfono o el email de la sede principal.",
      complete: Boolean(
        headquarters &&
          (nonEmpty(headquarters.phone) || nonEmpty(headquarters.email)),
      ),
      section: "sucursales",
    },
  ];
}

export interface CompletenessSummary {
  items: CompletenessItem[];
  completed: number;
  total: number;
  /** Porcentaje redondeado, 0-100. */
  percent: number;
  isComplete: boolean;
}

export function summarizeCompleteness(
  items: CompletenessItem[],
): CompletenessSummary {
  const total = items.length;
  const completed = items.filter((item) => item.complete).length;
  return {
    items,
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    isComplete: total > 0 && completed === total,
  };
}

/** Resumen de completitud de un taller (atajo sobre las dos funciones puras). */
export function getWorkshopCompleteness(
  workshop: Parameters<typeof computeWorkshopCompleteness>[0],
): CompletenessSummary {
  return summarizeCompleteness(computeWorkshopCompleteness(workshop));
}