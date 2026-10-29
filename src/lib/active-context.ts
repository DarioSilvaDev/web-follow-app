/**
 * Active Context store (F-020 / P2-6, D-020 A1; milestone consignación D-TL-12).
 *
 * Singleton por-pestaña con persistencia UX en `sessionStorage` (D-021,
 * resolución parcial 2026-10-29):
 * - `null` → contexto PERSONAL (default). El cliente API NO inyecta headers
 *   de contexto → comportamiento actual intacto (D-035).
 * - `{ type: "WORKSHOP", workshopId }` → el cliente API inyecta
 *   `X-Context-Type: WORKSHOP` + `X-Context-Id: {workshopId}` en todas las
 *   llamadas EXCEPTO `auth/*` (RF-3).
 * - `{ type: "DEALERSHIP", dealershipId }` → idem con contexto de
 *   concesionaria (D-TL-12): headers `X-Context-Type: DEALERSHIP` +
 *   `X-Context-Id: {dealershipId}` (miembro actuando en representación).
 *
 * ── Persistencia (D-021, alcance UX) ────────────────────────────────────────
 * El contexto se persiste en `sessionStorage` para que F5 o reabrir la pestaña
 * no lo pierda (caso crítico: `/vehicles/new` en flujo de concesionaria caía a
 * PERSONAL y el alta se guardaba a nombre personal en silencio).
 *
 * Por qué `sessionStorage` y no `localStorage`:
 * - Es por-pestaña y muere al cerrar la pestaña: no filtra el contexto de un
 *   usuario a otro en equipos compartidos (caso taller) ni entre pestañas con
 *   sesiones distintas.
 * - `localStorage` sobrevive reinicios/logout y multiplica el riesgo de
 *   contexto stale de una sesión anterior.
 *
 * Clave namespaced y versionada: `autentia:active-context:v1`. Payload mínimo
 * `{ type: "WORKSHOP" | "DEALERSHIP", id }`. NUNCA se guardan datos de usuario,
 * permisos ni tokens (D-001: la sesión es 100% cookie httpOnly).
 *
 * Tolerancia: JSON inválido, shape desconocido o claves de otra versión
 * (`autentia:active-context:*`) se descartan y se eliminan al hidratar.
 *
 * Esto NO es una frontera de seguridad: el backend re-valida la membresía en
 * cada request (`ContextResolver` → 403 si el contexto no corresponde). La
 * fuente de verdad del permiso es el backend; el storage solo recuerda la
 * selección UX.
 *
 * Fuera de alcance (D-021 sigue abierto en su alcance amplio):
 * - persistencia entre reinicios del navegador;
 * - sincronización multi-pestaña (`storage` event);
 * - sesión/contexto server-side (cookie httpOnly u homólogo).
 *
 * SSR/hydration: el módulo se evalúa también en el server, donde
 * `typeof window === "undefined"` ⇒ sin storage y contexto `null`. En el
 * cliente se hidrata desde `sessionStorage` al importar el módulo. Para
 * `useSyncExternalStore` se expone `getActiveContextServerSnapshot()` (null):
 * durante la hidratación React usa ese snapshot y luego re-renderiza con el
 * valor persistido, sin mismatch.
 *
 * Módulo PURO (sin React): expone suscripción mínima para alimentar
 * `useSyncExternalStore` desde `src/hooks/use-active-context.ts`.
 */

export type ActiveContext =
  | null
  | { type: "WORKSHOP"; workshopId: string }
  | { type: "DEALERSHIP"; dealershipId: string };

/** Clave versionada del storage. Cambiar la versión invalida el payload viejo. */
export const ACTIVE_CONTEXT_STORAGE_KEY = "autentia:active-context:v1";

/** Prefijo de todas las versiones conocidas/desconocidas. */
const ACTIVE_CONTEXT_STORAGE_PREFIX = "autentia:active-context:";

/** Shape persistido: mínimo, sin datos de usuario ni tokens. */
type StoredActiveContext = {
  type: "WORKSHOP" | "DEALERSHIP";
  id: string;
};

// ---------------------------------------------------------------------------
// sessionStorage helpers (SSR-safe, tolerantes a storage deshabilitado)
// ---------------------------------------------------------------------------

/**
 * `sessionStorage` puede no existir (SSR) o lanzar (modo privado / storage
 * bloqueado). En ambos casos el store sigue funcionando solo en memoria.
 */
function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Elimina claves de versiones anteriores/desconocidas del mismo namespace.
 * `sessionStorage` es pequeño y el prefijo es propio: el scan es barato.
 */
function pruneForeignVersions(storage: Storage): void {
  const staleKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (
      key &&
      key.startsWith(ACTIVE_CONTEXT_STORAGE_PREFIX) &&
      key !== ACTIVE_CONTEXT_STORAGE_KEY
    ) {
      staleKeys.push(key);
    }
  }
  for (const key of staleKeys) {
    storage.removeItem(key);
  }
}

/** Parsea el payload persistido. Devuelve `null` si es inválido. */
function parseStoredContext(raw: string | null): ActiveContext {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (record.type !== "WORKSHOP" && record.type !== "DEALERSHIP") {
      return null;
    }
    if (typeof record.id !== "string" || record.id.length === 0) {
      return null;
    }
    return record.type === "WORKSHOP"
      ? { type: "WORKSHOP", workshopId: record.id }
      : { type: "DEALERSHIP", dealershipId: record.id };
  } catch {
    return null;
  }
}

/** Lee y valida el contexto persistido; limpia payloads inválidos. */
function readStoredContext(): ActiveContext {
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }
  try {
    pruneForeignVersions(storage);
    const raw = storage.getItem(ACTIVE_CONTEXT_STORAGE_KEY);
    const context = parseStoredContext(raw);
    if (raw !== null && context === null) {
      // JSON inválido / shape desconocido → descartar.
      storage.removeItem(ACTIVE_CONTEXT_STORAGE_KEY);
    }
    return context;
  } catch {
    return null;
  }
}

/** Persiste el contexto actual (`null` = remover). Best-effort. */
function writeStoredContext(context: ActiveContext): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }
  try {
    if (context === null) {
      storage.removeItem(ACTIVE_CONTEXT_STORAGE_KEY);
      return;
    }
    const stored: StoredActiveContext =
      context.type === "WORKSHOP"
        ? { type: "WORKSHOP", id: context.workshopId }
        : { type: "DEALERSHIP", id: context.dealershipId };
    storage.setItem(ACTIVE_CONTEXT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Quota/disabled: la memoria sigue siendo la fuente del render.
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Hidratación en el cliente. En SSR no hay storage → `null`. La referencia es
 * estable hasta la próxima mutación (contrato de `useSyncExternalStore`).
 */
let activeContext: ActiveContext = readStoredContext();

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Current active context. `null` = PERSONAL. */
export function getActiveContext(): ActiveContext {
  return activeContext;
}

/**
 * Snapshot para `useSyncExternalStore` en el cliente: la referencia del actual
 * contexto es estable hasta que una mutación la reemplaza (contrato de React).
 */
export function getActiveContextSnapshot(): ActiveContext {
  return activeContext;
}

/**
 * Snapshot para SSR/hidratación: el server no lee storage y debe renderizar
 * PERSONAL. React lo usa durante la hidratación y luego re-renderiza con el
 * valor persistido del cliente (sin mismatch de markup).
 */
export function getActiveContextServerSnapshot(): ActiveContext {
  return null;
}

/** Activar el contexto de un taller (futuras llamadas llevan headers WORKSHOP). */
export function selectWorkshop(workshopId: string): void {
  if (
    activeContext?.type === "WORKSHOP" &&
    activeContext.workshopId === workshopId
  ) {
    return;
  }
  activeContext = { type: "WORKSHOP", workshopId };
  writeStoredContext(activeContext);
  emit();
}

/** Activar el contexto de una concesionaria (headers DEALERSHIP, D-TL-12). */
export function selectDealership(dealershipId: string): void {
  if (
    activeContext?.type === "DEALERSHIP" &&
    activeContext.dealershipId === dealershipId
  ) {
    return;
  }
  activeContext = { type: "DEALERSHIP", dealershipId };
  writeStoredContext(activeContext);
  emit();
}

/** Volver a PERSONAL desde WORKSHOP (noop en otro contexto). */
export function clearWorkshop(): void {
  if (activeContext === null || activeContext.type !== "WORKSHOP") {
    return;
  }
  activeContext = null;
  writeStoredContext(null);
  emit();
}

/** Salir del contexto de concesionaria → PERSONAL (noop en otro contexto). */
export function clearDealership(): void {
  if (activeContext === null || activeContext.type !== "DEALERSHIP") {
    return;
  }
  activeContext = null;
  writeStoredContext(null);
  emit();
}

/**
 * Resetear CUALQUIER contexto (PERSONAL). Usado por logout, pérdida de sesión
 * y guard de membresía. Limpia también el storage aunque la memoria ya esté en
 * `null` (idempotente: cubre logout tras una hidratación fallida).
 */
export function clearActiveContext(): void {
  const hadContext = activeContext !== null;
  activeContext = null;
  writeStoredContext(null);
  if (hadContext) {
    emit();
  }
}

/** Suscribirse a cambios (retorna unsubscribe). */
export function subscribeActiveContext(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
