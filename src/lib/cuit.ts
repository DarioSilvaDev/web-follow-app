/**
 * Validación de CUIT (ARG) — lógica de dominio pura, sin React ni fetch.
 *
 * Espejo de `src/lib/attachment-validation.ts`: la validación que acompaña a un
 * campo de formulario vive en `lib/` para poder testearse de forma aislada y
 * reutilizarse (invitaciones, perfil de taller, alta de concesionaria).
 *
 * Alcance (DECISION-REGISTER PROD-002): validación **sintáctica** — forma y
 * dígito verificador. NO hay consulta a AFIP/ARCA en el MVP: decisión PM
 * explícita (EP-3 = no) por dependencia externa, latencia y disponibilidad.
 *
 * La verificación de que el CUIT esté efectivamente registrado ante la ARCA es
 * un problema de confianza distinto y sigue sin cubrirse: esta función solo
 * garantiza que el número sea internamente consistente, no que exista.
 */

/**
 * Valida un CUIT argentino por forma (11 dígitos) y dígito verificador.
 *
 * Acepta el número con o sin guiones: el input del usuario suele tipear
 * `30-12345678-9`.
 */
export function isValidCuit(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return false;

  // Pesos del algoritmo oficial: se aplican a los primeros 10 dígitos.
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * weights[i];
  }

  let checkDigit = 11 - (sum % 11);
  if (checkDigit === 11) checkDigit = 0;
  // El resto 10 no puede representarse: la ARCA usa el 9 para estos casos.
  if (checkDigit === 10) checkDigit = 9;

  return checkDigit === Number(digits[10]);
}

/**
 * Normaliza un CUIT a la forma con guiones `XX-XXXXXXXX-X`.
 * Devuelve el input original si no tiene 11 dígitos.
 */
export function formatCuit(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}