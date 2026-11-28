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
 * ALCANCE: se usa en los inputs de REGISTRO de patente (alta/edición de
 * vehículo, lookup del check-in y reclamo) y, vía `formatLicensePlateInput`, en
 * el buscador de `/atenciones` para dar feedback de formato mientras se
 * escribe. Esa búsqueda sigue siendo PARCIAL (no exige patente completa).
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

/**
 * Formatea el valor de un input MIENTRAS se escribe (buscador de atenciones).
 *
 * Regla progresiva:
 * 1. se descartan caracteres que no sean letras/dígitos y se fuerza MAYÚSCULAS;
 * 2. los DOS primeros caracteres válidos deben ser letras (se ignoran dígitos
 *    que aparezcan antes);
 * 3. el 3.er carácter define el formato: letra → `AAA111`, dígito → `AA111AA`;
 * 4. desde ahí se aceptan SOLO caracteres en el orden de ese formato, hasta
 *    6 caracteres (AAA111) o 7 (AA111AA). Los que no encajan se descartan.
 *
 * Ejemplos: `"fk"` → `"FK"`; `"fk1"` → `"FK1"`; `"fk123ab"` → `"FK123AB"`;
 * `"fka"` → `"FKA"`; `"fka123"` → `"FKA123"`; `"1f2k3a4b5"` → `"FK345"`.
 *
 * A diferencia de `detectLicensePlateFormat`, acepta valores parciales: es
 * feedback de tipeo, no validación de patente completa.
 */
export function formatLicensePlateInput(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean === "") return "";

  let result = "";
  let index = 0;

  // Dos letras obligatorias al inicio (se ignoran dígitos previos).
  while (result.length < 2 && index < clean.length) {
    const char = clean[index++];
    if (char >= "A" && char <= "Z") result += char;
  }
  if (result.length < 2 || index >= clean.length) return result;

  // El tercer carácter define el formato y queda fijo.
  const third = clean[index++];
  const isOld = third >= "A" && third <= "Z";
  result += third;
  // AAA111 → 6 caracteres; AA111AA → 7 caracteres.
  const maxLength = isOld ? 6 : 7;

  for (; index < clean.length && result.length < maxLength; index++) {
    const char = clean[index];
    const isDigit = char >= "0" && char <= "9";
    const isLetter = char >= "A" && char <= "Z";

    if (isOld) {
      // AAA111: 3 letras + hasta 3 dígitos.
      if (isDigit) result += char;
      continue;
    }

    // AA111AA: 2 letras + 3 dígitos + 2 letras.
    const digits = result.slice(2).replace(/[^0-9]/g, "").length;
    if (digits < 3 && isDigit) result += char;
    else if (digits === 3 && isLetter) result += char;
  }

  return result;
}

/** Copy compartida del error de formato en inputs de registro. */
export const LICENSE_PLATE_FORMAT_ERROR =
  "La patente debe tener el formato AAA111 o AA111AA.";
