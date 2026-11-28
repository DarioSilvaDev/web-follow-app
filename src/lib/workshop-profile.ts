/**
 * Mapeos puros del formulario de perfil del taller (PROD-001/002/005/006).
 *
 * Antes vivían inline en `onSubmit` y en el `reset` de
 * `workshop-profile-form.tsx`. Extraerlos permite testear el contrato sin
 * montar React y evita que dos bloques de código converjan en valores distintos.
 *
 * ⚠️ No normalizar `taxId` a solo dígitos: el backend guarda con guiones en
 * este endpoint (BE-005 es un bug abierto del backend, no se oculta acá).
 */

import { formatCuit } from "@/lib/cuit";
import type { UpdateWorkshopInput, WorkshopDetail } from "@/types/workshop";

/** Forma del formulario: campos opcionales pueden ser `""` (sin valor). */
export interface WorkshopProfileFormValues {
  name: string;
  legalName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  website?: string;
  description?: string;
}

/** Valores iniciales desde la entidad del detalle. */
export function toFormValues(workshop: WorkshopDetail): WorkshopProfileFormValues {
  return {
    name: workshop.name ?? "",
    legalName: workshop.legalName ?? "",
    // El backend normaliza `taxId` a dígitos; `formatCuit` lo muestra con
    // guiones para que editar y recargar muestren la misma forma.
    taxId: formatCuit(workshop.taxId ?? ""),
    email: workshop.email ?? "",
    phone: workshop.phone ?? "",
    website: workshop.website ?? "",
    description: workshop.description ?? "",
  };
}

/** Valores normalizados para dejar el form limpio tras un guardado exitoso. */
export function toSubmitValues(
  values: WorkshopProfileFormValues,
): WorkshopProfileFormValues {
  return {
    name: values.name.trim(),
    legalName: values.legalName?.trim() ?? "",
    taxId: values.taxId?.trim() ?? "",
    email: values.email?.trim() ?? "",
    phone: values.phone?.trim() ?? "",
    website: values.website?.trim() ?? "",
    description: values.description?.trim() ?? "",
  };
}

/** Payload exacto de `PATCH /workshops/:id` — vacío → `null`. */
export function toUpdateWorkshopPayload(
  values: WorkshopProfileFormValues,
): UpdateWorkshopInput {
  return {
    name: values.name.trim(),
    legalName: values.legalName?.trim() || null,
    taxId: values.taxId?.trim() || null,
    email: values.email?.trim() || null,
    phone: values.phone?.trim() || null,
    website: values.website?.trim() || null,
    description: values.description?.trim() || null,
  };
}
