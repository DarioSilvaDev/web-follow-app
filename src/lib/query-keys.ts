import type { QueryClient } from "@tanstack/react-query";

/**
 * Query keys del dominio Vehículos (D-TL-19).
 *
 * ── Por qué las claves son jerárquicas aunque los endpoints difieran ────────
 * En contexto DEALERSHIP, `GET /vehicles` y `GET /dealerships/:id/vehicles`
 * (tab Exhibición) devuelven el MISMO conjunto de vehículos desde el backend
 * (`api-follow-app/.../list-vehicles.handler.ts:53`, D-TL-19), pero con DTOs
 * distintos: la exhibición usa un shape acotado (`consignedAt`, fotos, etc.).
 *
 * No se unifican fetch ni DTO (se perderían campos o se rompería el contrato
 * de cada pantalla). Lo que sí se unifica es el **namespace + invalidación**:
 * todas las superficies viven bajo el prefijo `["vehicles"]`, de modo que
 * invalidar `vehicleKeys.all` invalida TODAS de una sola vez. La clave
 * jerárquica codifica "misma familia de datos, vistas distintas".
 *
 * Prefijo `["vehicles"]` (comportamiento aceptado y documentado):
 * también matchea `vehicleKeys.transfersOwned()` (`["vehicles","transfers",
 * "owned"]`) y cualquier lista/dashboard. Es intencional: una mutación sobre
 * un vehículo puede cambiar cualquier vista del conjunto.
 *
 * `vehicleKeys.detail` queda en el namespace singular `["vehicle", id]` porque
 * es la entidad individual (ficha/fotos/documentos/historial), no una vista
 * del conjunto. Su invalidación es dirigida y se mantiene explícita en cada
 * mutación que cambia la ficha.
 */

export interface VehicleListKeyParams {
  page: number;
  limit: number;
  /** Búsqueda efectiva; `undefined`/vacío ⇒ sin filtro (misma entrada). */
  q?: string;
}

export const vehicleKeys = {
  /** Prefijo raíz: invalida todas las superficies del conjunto. */
  all: ["vehicles"] as const,

  /** Prefijo de listados paginados. */
  lists: () => [...vehicleKeys.all, "list"] as const,

  /** Listado paginado (`/vehicles`): `["vehicles","list",page,limit,q]`. */
  list: ({ page, limit, q }: VehicleListKeyParams) =>
    [...vehicleKeys.lists(), page, limit, q ?? ""] as const,

  /** Resumen del dashboard (`/dashboard`): `["vehicles","dashboard"]`. */
  dashboard: () => [...vehicleKeys.all, "dashboard"] as const,

  /** Vehículos propios del selector de transferencias. */
  transfersOwned: () => [...vehicleKeys.all, "transfers", "owned"] as const,

  /**
   * Exhibición de una concesionaria (`/dealerships/:id/vehicles`).
   * Jerárquica bajo `["vehicles"]` para que `vehicleKeys.all` la cubra.
   */
  dealershipExhibition: (dealershipId: string) =>
    [...vehicleKeys.all, "dealership", dealershipId] as const,

  /** Entidad individual (`/vehicles/:id`), namespace singular independiente. */
  detail: (vehicleId: string) => ["vehicle", vehicleId] as const,
} as const;

/**
 * Invalida TODAS las vistas del conjunto de vehículos (lista, dashboard,
 * transferencias, exhibición de concesionaria) en una sola llamada.
 *
 * Objetivo: que cada mutación de vehículos no tenga que recordar una lista de
 * claves (hubo bugs por olvidar la Exhibición). NO invalida
 * `vehicleKeys.detail`: la ficha individual se invalida explícitamente donde
 * corresponde (la mutación conoce el id).
 */
export function invalidateVehicleViews(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
}
