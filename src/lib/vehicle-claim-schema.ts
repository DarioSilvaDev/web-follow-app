import { z } from "zod";

/**
 * Schemas zod del wizard público de reclamo (F-1, `/reclamo/[token]`).
 *
 * Copy de validación literal del spec `vehicle-claim-copy.md` §1.3 / §1.4 /
 * §1.5 (fuente de verdad). La validación del backend es idéntica
 * (`VerifyClaimDto`: patente `^[A-Za-z0-9]{2,10}$`, vinLast4 `Length(4,4)`):
 * el frontend es la primera línea de feedback, el backend es la autoridad.
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
      if (!/^[A-Za-z0-9]{2,10}$/.test(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "La patente no tiene un formato válido. Revisala e intentá de nuevo.",
        });
      }
    }),
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
