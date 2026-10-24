/**
 * VIN validation — mirror of the backend
 * `api-follow-app/src/common/validation/vin.ts` (D-04 / D-145).
 *
 * DECISION: FORMAT-ONLY validation.
 * The frontend and backend must accept/reject exactly the same strings, so
 * this module intentionally implements only the shape rule:
 *   - normalize: `trim()` + `toUpperCase()`.
 *   - valid: exactly 17 characters from the alphabet `[A-HJ-NPR-Z0-9]`
 *     (excludes the ambiguous letters I, O and Q).
 *
 * It deliberately does NOT implement a North-American check digit nor a WMI
 * allowlist: those would reject legitimate vehicles (legacy short/foreign
 * VINs, uncatalogued brands) and the backend mirror does not implement them
 * either. Keeping both sides identical is the whole point of the mirror
 * (drift is detected by running the same test vectors on each repo).
 *
 * NOTE (DEPENDENCY): the backend file above was not present in the repo at
 * implementation time, so the shared test vectors were derived from the
 * D-145 format rule. When the backend fixture is published, copy its vectors
 * here verbatim (D-04 §9.1/§9.2).
 */

/** Valid VIN length (ISO 3779 — North American VIN). */
export const VIN_LENGTH = 17;

/** Exactly 17 chars, I/O/Q excluded (case-insensitive — normalized first). */
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

/** `trim()` + `toUpperCase()`. Applied before validating and before persisting. */
export function normalizeVin(value: string): string {
  return value.trim().toUpperCase();
}

/** Format-only VIN check (normalizes internally, so callers may pass raw input). */
export function isValidVin(value: string): boolean {
  return VIN_PATTERN.test(normalizeVin(value));
}
