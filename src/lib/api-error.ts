/**
 * Helper compartido para leer el status HTTP de un ApiError del cliente
 * (src/lib/api.ts). Usado por las secciones del detalle de vehículo.
 */
export function errorStatus(error: unknown): number | undefined {
  return (error as { status?: number }).status;
}
