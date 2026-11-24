import { z } from "zod";
import { isValidLicensePlate, normalizeLicensePlate } from "@/lib/license-plate";

/**
 * Schemas zod del wizard público de reclamo (F-1, `/reclamo/[token]`).
 *
 * Copy de validación literal del spec `vehicle-claim-copy.md` §1.3 / §1.4 /
 * §1.5 (fuente de verdad). El frontend valida la patente con el formato
 * argentino AAA111 / AA111AA (`@/lib/license-plate`) — más estricto que
 * `VerifyClaimDto` del backend, que sigue aceptando `^[A-Za-z0-9]{2,10}$`;
 * el backend es la autoridad, el frontend es la primera línea de feedback.
 *
 * Se usa `superRefine` para garantizar UN solo issue por campo: con
 * `.min()` + `.regex()` un campo vacío produce dos issues y el mensaje que
 * ve el usuario depende del orden del resolver.
 */

/** §1.3 — patente: vacío o formato inválido. */
export const claimPlateSchema = z.object({
  licensePlate: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (!value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ingresá la patente del vehículo.",
        });
        return;
      }
      if (!isValidLicensePlate(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "La patente no tiene un formato válido. Revisala e intentá de nuevo.",
        });
      }
    })
    .transform((value) => normalizeLicensePlate(value)),
});

export type ClaimPlateValues = z.infer<typeof claimPlateSchema>;

/** §1.4 — últimos 4 del VIN: vacío o longitud distinta de 4. */
export const claimVinSchema = z.object({
  vinLast4: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (!value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ingresá los últimos 4 caracteres del VIN.",
        });
        return;
      }
      if (value.length !== 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El VIN tiene que tener 4 caracteres.",
        });
      }
    }),
});

export type ClaimVinValues = z.infer<typeof claimVinSchema>;

/** §1.5 — mensaje cuando no hay rango de kilometraje seleccionado. */
export const CLAIM_MILEAGE_REQUIRED_ERROR =
  'Elegí un rango o la opción "No lo sé".';
