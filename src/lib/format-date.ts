/**
 * Helpers de formato de fecha compartidos entre las secciones del detalle
 * de vehículo (ficha, fotos, documentos, kilometraje).
 *
 * Convención locale: es-AR.
 *
 * Dos semánticas distintas, nunca mezcladas (Plan 05 / D-TZ-6, D-TZ-7):
 * - **fecha calendario** (`YYYY-MM-DD`) → `formatDateOnly` (siempre en UTC).
 * - **instante** (ISO con `Z`) → `formatDate` / `formatDateTime` (hora local).
 */

/** Fecha corta: "02 sep 2026". Devuelve "—" si el valor es inválido/vacío. */
export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Fecha + hora: "02 sep 2026, 14:30". Devuelve "—" si es inválido/vacío. */
export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Fecha calendario (Plan 05 / D-TZ-6, D-TZ-7) — NO usar con instantes.
// ---------------------------------------------------------------------------

/** `2026-11-11` — fecha calendario canónica en el wire. */
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Rollout tolerante **estrecho** (D-TZ-7): acepta el ISO completo solo si es
 * exactamente medianoche UTC (`00:00:00`, con o sin milisegundos, `Z` o
 * `+00:00`). Cualquier otro instante se rechaza: truncarlo daría el día
 * equivocado (`2026-11-11T23:00:00-03:00` = 12/11 UTC).
 */
const MIDNIGHT_UTC_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.\d{1,3})?(?:Z|\+00:00)$/;

/**
 * Normaliza un valor de fecha calendario a `YYYY-MM-DD`, o `null` si no lo es.
 *
 * Acepta `YYYY-MM-DD` y el ISO de medianoche UTC (tolerancia estrecha, ver
 * arriba). Valida round-trip contra `Date.UTC`: una fecha imposible como
 * `2026-02-30` (que el engine normaliza a marzo) devuelve `null` en vez de
 * inventar un día.
 */
export function toDateOnly(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.trim();
  const datePart = DATE_ONLY_PATTERN.test(raw)
    ? raw
    : (MIDNIGHT_UTC_PATTERN.exec(raw)?.[1] ?? null);
  if (!datePart) return null;

  const date = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Round-trip: descarta fechas fuera de calendario (2026-02-30, 2026-13-01).
  if (date.toISOString().slice(0, 10) !== datePart) return null;

  return datePart;
}

/** Estilo del mes: `short` ("nov") o `numeric` ("11/11/2026"). */
export type DateOnlyStyle = "short" | "numeric";

/**
 * Fecha calendario (se formatea **siempre en UTC**, así el día no depende de
 * la timezone del cliente). Devuelve "—" para `null`/`undefined`/`""`/
 * no-fecha-calendario — nunca trunca un instante.
 *
 * `style` existe solo por consistencia visual: el timeline de historial
 * (`history-section`) ya mostraba `dd/mm/yyyy` para instantes, así que las
 * fechas calendario de esa misma lista usan `numeric`. El resto de la app usa
 * el default `short`.
 */
export function formatDateOnly(
  value?: string | null,
  style: DateOnlyStyle = "short",
): string {
  const dateOnly = toDateOnly(value);
  if (!dateOnly) return "—";
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: style === "numeric" ? "2-digit" : "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
