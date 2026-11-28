/**
 * Validadores reutilizables para formularios de entidades (taller, sucursal,
 * dealership). Lógica pura: sin React, sin fetch, testeable de forma aislada.
 *
 * Motivo de la extracción: `optionalText` estaba duplicado en
 * `workshop-profile-form.tsx` y `workshop-branches-section.tsx`. La idea es
 * compartir los validadores, NO unificar esquemas completos: los contratos
 * difieren entre entidades (`name` max 150 vs 120, `website` texto libre vs
 * `.url()`, `description` max 200 vs 500). Unificarlos a ciegas rechazaría
 * valores hoy válidos.
 *
 * Todos devuelven `string | undefined` y aceptan `""` como "sin valor" para
 * que el mapeo a payload pueda convertirlo en `null` (ver `workshop-profile.ts`).
 */

import { z } from "zod";
import { isValidCuit } from "@/lib/cuit";

/** Texto opcional con límite. El `label` se usa solo en el mensaje de error. */
export const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} no puede superar los ${max} caracteres.`)
    .optional()
    .or(z.literal(""));

/** Email opcional. Mensaje parametrizable para los casos con copy propio. */
export const optionalEmail = (message = "Ingresá un email válido.") =>
  z.string().trim().email(message).optional().or(z.literal(""));

/**
 * CUIT opcional con validación sintáctica (PROD-002): 11 dígitos + verificador.
 * NO consulta AFIP/ARCA (EP-3 = no en el MVP).
 *
 * ⚠️ BE-006: el backend hoy no valida el CUIT. Este validator es UX, no la
 * frontera de integridad del servidor; no presentarlo como validación oficial.
 */
export const optionalCuit = () =>
  z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || isValidCuit(value), {
      message: "El CUIT no es válido. Revisá los 11 dígitos.",
    });
