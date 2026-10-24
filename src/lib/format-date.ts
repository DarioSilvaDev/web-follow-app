/**
 * Helpers de formato de fecha compartidos entre las secciones del detalle
 * de vehículo (ficha, fotos, documentos, kilometraje).
 *
 * Convención locale: es-AR.
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
