/**
 * Constantes compartidas de la app.
 */

/**
 * staleTime por defecto del QueryClient (ver src/providers/query-provider.tsx).
 * Centralizado aquí para que las queries puedan referenciarlo explícitamente.
 */
export const DEFAULT_STALE_TIME = 30_000;

/**
 * staleTime para queries de media con URLs firmadas (fotos/documentos del
 * vehículo). El backend firma con `SIGNED_URL_EXPIRES_SECONDS` (default 3600 s
 * = 1 h); 5 min es muy por debajo de ese límite y evita refetches en cada
 * mount de la sección.
 */
export const MEDIA_STALE_TIME = 300_000;

/**
 * Si una URL firmada vence en menos de este umbral, se invalida la query de
 * la lista antes de abrir el visor/preview (refetch preventivo para no
 * mostrar un media con la URL ya vencida).
 */
export const SIGNED_URL_REFRESH_THRESHOLD_MS = 60_000;

/**
 * staleTime para catálogos estáticos del backend (ej. `GET
 * /vehicles/documents/types`). El endpoint sirve un array en memoria que
 * solo cambia con un deploy del backend, así que 24 h evita refetches sin
 * riesgo de datos viejos relevantes (recomendación Backend Tech Lead: sin
 * cache server-side — sería sobre-arquitecturar).
 */
export const CATALOG_STALE_TIME = 86_400_000;
