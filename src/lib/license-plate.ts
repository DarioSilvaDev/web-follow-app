/**
 * Control de formato de patente — formatos argentinos (AAA111 / AA111AA).
 *
 * La regla se decide por el 3.er carácter:
 * - LETRA → patente vieja `AAA111`: 3 letras + 3 dígitos, en ese orden.
 * - NÚMERO → patente nueva `AA111AA`: 2 letras + 3 dígitos + 2 letras, en
 *   ese orden.
 *
 * Cualquier otro caso (longitud distinta, otro orden de letras/dígitos,
 * guiones, espacios internos, etc.) es inválido. El 3.er carácter que no sea
 * ni letra ni número también invalida la patente.
 *
 * `normalizeLicensePlate` aplica `trim()` + `toUpperCase()` — mismo criterio
 * D-037/D-042 que normaliza el backend antes de comparar/persistir.
 *
 * ALCANCE: se usa solo en los inputs de REGISTRO de patente (alta/edición de
 * vehículo, lookup del check-in y reclamo). Las búsquedas parciales de los
 * listados (/vehicles, /atenciones) NO exigen formato completo.
 *
 * NOTA: el backend hoy sigue validando 2–10 alfanuméricos (más permisivo);
 * esta regla es una capa de feedback del frontend, no un contrato nuevo.
 */

/** Formatos posibles, según el 3.er carácter. */
export type LicensePlateFormat = "AAA111" | "AA111AA";

/** Patente vieja: 3 letras + 3 dígitos. */
const OLD_FORMAT_PATTERN = /^[A-Z]{3}\d{3}$/;

/** Patente nueva: 2 letras + 3 dígitos + 2 letras. */
const NEW_FORMAT_PATTERN = /^[A-Z]{2}\d{3}[A-Z]{2}$/;

/** `trim()` + `toUpperCase()`. */
export function normalizeLicensePlate(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Detecta el formato según el 3.er carácter y valida que se respete el orden
 * de letras/dígitos de ese formato. Devuelve `null` si no cumple ninguno.
 * Normaliza internamente, así que se puede pasar el valor crudo del input.
 */
export function detectLicensePlateFormat(
  value: string,
): LicensePlateFormat | null {
  const plate = normalizeLicensePlate(value);
  if (plate.length < 3) return null;

  const third = plate[2];
  if (third >= "A" && third <= "Z") {
    return OLD_FORMAT_PATTERN.test(plate) ? "AAA111" : null;
  }
  if (third >= "0" && third <= "9") {
    return NEW_FORMAT_PATTERN.test(plate) ? "AA111AA" : null;
  }
  return null;
}

/** `true` si la patente completa es `AAA111` o `AA111AA`. */
export function isValidLicensePlate(value: string): boolean {
  return detectLicensePlateFormat(value) !== null;
}

/** Copy compartida del error de formato en inputs de registro. */
export const LICENSE_PLATE_FORMAT_ERROR =
  "La patente debe tener el formato AAA111 o AA111AA.";
