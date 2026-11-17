import { z } from "zod";
import { isValidVin, normalizeVin } from "@/lib/vin";
import type {
  RegisterVehicleInput,
  UpdateVehicleInput,
  Vehicle,
} from "@/types/vehicle";

// ---------------------------------------------------------------------------
// Shared vehicle form schema + mappings (register F-010 / edit F-011).
//
// Single source of truth so the "alta" and "edición" forms do NOT diverge in
// validation (RF-5). Mirrors the backend RegisterVehicleDto (F-010 §9):
// - D-037: alphanumeric plate 2–10, normalized to uppercase + trim.
// - D-036: VIN optional. D-038: catalog optional.
// - D-04/D-145 (Gap 1): VIN is validated with the shared format rule when
//   present (register only — see `editVehicleFormSchema`).
// - D-07 (Gap 1): `initialMileage` es obligatorio en DEALERSHIP y opcional en
//   PERSONAL (D-206: kilometraje actual declarado por el propietario).
// ---------------------------------------------------------------------------

export const vehicleFormSchema = z.object({
  licensePlate: z
    .string()
    .trim()
    .min(2, "La patente debe tener al menos 2 caracteres")
    .max(10, "La patente debe tener como máximo 10 caracteres")
    .refine(
      (value) => /^[a-zA-Z0-9]+$/.test(value),
      "La patente solo puede contener letras y números",
    )
    .transform((value) => value.toUpperCase()),
  vin: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => value === undefined || value === "" || isValidVin(value),
      "El VIN debe tener 17 caracteres válidos (sin I, O ni Q).",
    ),
  manufactureYear: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{4}$/.test(value),
      "El año de fabricación debe ser un año válido (ej. 2020)",
    )
    .refine(
      (value) =>
        value === "" || (Number(value) >= 1900 && Number(value) <= 2100),
      "El año de fabricación debe estar entre 1900 y 2100",
    )
    .optional(),
  modelYear: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{4}$/.test(value),
      "El año del modelo debe ser un año válido (ej. 2020)",
    )
    .refine(
      (value) =>
        value === "" || (Number(value) >= 1900 && Number(value) <= 2100),
      "El año del modelo debe estar entre 1900 y 2100",
    )
    .optional(),
  color: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  /**
   * D-07 (Gap 1): kilometraje al dar de alta el vehículo.
   * - PERSONAL (D-206): "kilometraje actual" OPCIONAL. El usuario está
   *   registrando SU vehículo y conoce (o puede consultar) el odómetro.
   * - DEALERSHIP: "kilometraje inicial" OBLIGATORIO (alta de 0 km).
   * Se mantiene como string (input controlado) y se valida el formato aquí;
   * la obligatoriedad en DEALERSHIP la impone el submit (setError) porque el
   * schema no conoce el Active Context.
   */
  initialMileage: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => value === undefined || value === "" || /^\d+$/.test(value),
      "El kilometraje debe ser un número entero",
    ),
});

export type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

/**
 * D-03 (Gap 1): EDIT schema. The VIN is no longer editable through the form —
 * the backend rejects it via PATCH (`@IsEmpty()`), so the field is omitted
 * entirely (the edit page renders it as a read-only value + "Corregir VIN").
 * `initialMileage` is a register-only concept. Everything else is shared.
 */
export const editVehicleFormSchema = vehicleFormSchema.omit({
  vin: true,
  initialMileage: true,
});

export type EditVehicleFormValues = z.infer<typeof editVehicleFormSchema>;

/**
 * Build the register API payload, dropping empty optional fields (undefined
 * omitted). Register (F-010) ONLY — the edit flow (F-011) uses
 * `toEditVehicleInput` (D-043 sends explicit `null` for cleared optional
 * fields; register keeps empty optionals → undefined/omitted).
 *
 * D-206: `initialMileage` viaja en AMBOS contextos cuando el usuario lo
 * completa. En PERSONAL es el "kilometraje actual" opcional que declara el
 * propietario; en DEALERSHIP es el "kilometraje inicial" obligatorio (la
 * obligatoriedad la impone el submit, no este mapper). El backend lo persiste
 * como la primera lectura del odómetro (source owner / dealership).
 * D-04/D-145: el VIN se normaliza antes de viajar.
 *
 * Catálogo (MVP sin versiones): `brandId` + `modelId` viajan JUNTOS o no
 * viajan. El backend rechaza el par incompleto, así que si falta cualquiera
 * de los dos se omiten ambos.
 */
export function toVehicleInput(
  data: VehicleFormValues,
  catalog: { brandId: string; modelId: string },
): RegisterVehicleInput {
  const payload: RegisterVehicleInput = {
    licensePlate: data.licensePlate,
    vin: data.vin ? normalizeVin(data.vin) : undefined,
    manufactureYear: data.manufactureYear
      ? Number(data.manufactureYear)
      : undefined,
    modelYear: data.modelYear ? Number(data.modelYear) : undefined,
    color: data.color || undefined,
    notes: data.notes || undefined,
  };

  if (catalog.brandId !== "" && catalog.modelId !== "") {
    payload.brandId = catalog.brandId;
    payload.modelId = catalog.modelId;
  }

  const mileage = data.initialMileage?.trim();
  if (mileage) {
    payload.initialMileage = Number(mileage);
  }

  return payload;
}

/**
 * Optional text field rule (D-043 / RF-8):
 * - with a value → send the value;
 * - cleared by the user and the prefill had content → explicit `null`
 *   (the backend persists NULL);
 * - already empty in the prefill AND still empty → omit (`undefined`,
 *   same semantics, no noise).
 */
function optionalStringOrNull(
  current: string | undefined,
  original: string | undefined,
): string | null | undefined {
  const value = current?.trim() ?? "";
  if (value !== "") return value;
  return (original ?? "").trim() !== "" ? null : undefined;
}

/** Same rule for the numeric years — zod already validated non-empty as 4 digits. */
function optionalYearOrNull(
  current: string | undefined,
  original: string | undefined,
): number | null | undefined {
  const value = current?.trim() ?? "";
  if (value !== "") return Number(value);
  return (original ?? "").trim() !== "" ? null : undefined;
}

/**
 * Build the EDIT PATCH payload (F-011 / D-043 RF-8).
 *
 * Requires the original `Vehicle` (prefill) to decide between:
 * - value present → send the value;
 * - cleared vs. prefilled content → explicit `null` (backend persists NULL);
 * - still empty and was empty in the prefill → omit (`undefined`, no noise).
 *
 * `brandId`/`modelId` solo viajan cuando el usuario cambió la selección del
 * catálogo (nunca null): omitir = la rama actual NO se toca (RF-2). Viajan
 * SIEMPRE juntos — el backend rechaza el par incompleto, por eso el mapper
 * exige ambos. `licensePlate` is required and always travels with a value
 * (never null).
 *
 * D-03 (Gap 1): the VIN is NEVER part of this payload — the backend rejects it
 * by PATCH and the correction goes through the audited command instead.
 *
 * Register (F-010) keeps `toVehicleInput` — it never sends null.
 */
export function toEditVehicleInput(
  original: Vehicle,
  data: EditVehicleFormValues,
  catalog: { brandId: string; modelId: string },
): UpdateVehicleInput {
  const originalValues = vehicleToFormValues(original);

  const payload: UpdateVehicleInput = { licensePlate: data.licensePlate };

  const color = optionalStringOrNull(data.color, originalValues.color);
  if (color !== undefined) payload.color = color;

  const notes = optionalStringOrNull(data.notes, originalValues.notes);
  if (notes !== undefined) payload.notes = notes;

  const manufactureYear = optionalYearOrNull(
    data.manufactureYear,
    originalValues.manufactureYear,
  );
  if (manufactureYear !== undefined) payload.manufactureYear = manufactureYear;

  const modelYear = optionalYearOrNull(
    data.modelYear,
    originalValues.modelYear,
  );
  if (modelYear !== undefined) payload.modelYear = modelYear;

  // Catálogo (MVP sin versiones): la página solo pasa los ids cuando la
  // selección cambió; acá se exige el par completo (nunca uno solo).
  if (catalog.brandId !== "" && catalog.modelId !== "") {
    payload.brandId = catalog.brandId;
    payload.modelId = catalog.modelId;
  }

  return payload;
}

/**
 * Map a loaded `Vehicle` (GET /:id, VehicleResponseDto) into form values.
 * Years are numbers in the API and free-text inputs in the form.
 *
 * D-03 (Gap 1): no `vin` — it is not editable through the form, so it is not a
 * form value. The edit page renders it read-only from the loaded vehicle.
 */
export function vehicleToFormValues(vehicle: Vehicle): EditVehicleFormValues {
  return {
    licensePlate: vehicle.licensePlate ?? "",
    manufactureYear: vehicle.manufactureYear?.toString() ?? "",
    modelYear: vehicle.modelYear?.toString() ?? "",
    color: vehicle.color ?? "",
    notes: vehicle.notes ?? "",
  };
}

/**
 * Map a 409 CONFLICT message to the offending field (RF-3, RF-6).
 * Matches the Spanish backend messages (D-041) and, defensively, the legacy
 * English ones used by earlier register versions.
 */
export function conflictField(
  message?: string,
): "licensePlate" | "vin" | "engineNumber" | null {
  const text = (message ?? "").toLowerCase();
  if (text.includes("patente") || text.includes("plate")) return "licensePlate";
  if (text.includes("vin")) return "vin";
  if (text.includes("motor") || text.includes("engine")) return "engineNumber";
  return null;
}

export const CONFLICT_MESSAGES = {
  licensePlate: "Ya existe un vehículo registrado con esa patente.",
  vin: "Ya existe un vehículo registrado con ese VIN.",
  engineNumber: "Ya existe un vehículo registrado con ese número de motor.",
} as const;
