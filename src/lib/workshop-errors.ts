/**
 * Auto-servicio del taller ("Mi taller") — mapeo de errores
 * (DECISION-REGISTER PROD-001).
 *
 * Shape del error consumido (`src/lib/api.ts` → `toApiError` normaliza
 * `error.data` de ky): `{ status, message?, code? }`, con `message` y `code`
 * en el top-level del body HTTP.
 *
 * Contratos backend (existentes, hasta ahora no consumidos por el frontend):
 * - GET   /api/workshops/:id          → 200 WorkshopResponseDto. 403 cuando el
 *   usuario no tiene membresía activa (el handler valida por `userId`).
 * - PATCH /api/workshops/:id          → 200 entidad `Workshop` (SIN branches
 *   embebidas). `WorkshopGuard` + `PermissionsGuard` (`workshop.update`).
 *   404 si el taller no existe; 403 si no hay membresía activa o el rol no
 *   tiene el permiso.
 * - POST  /api/workshops/:id/branches  → 201 `WorkshopBranch` creada.
 *   `workshop.branch.create`. 404 si el taller no existe; 403 sin permiso.
 *
 * El frontend NUNCA muestra el mensaje crudo del backend (patrón
 * `src/lib/transfer-errors.ts` / `src/lib/admin-errors.ts`, y
 * DECISION-REGISTER FR-007).
 *
 * NOTA DE CONTRATO (importante): el 403 de estos endpoints **no distingue**
 * "no sos miembro" de "tu rol no tiene el permiso". `/auth/me` todavía no
 * expone el permiso efectivo por membresía (`BE-004`, pendiente). Por eso la
 * UI no puede deshabilitar la acción de forma preventiva y solo reacciona al
 * 403 — ver DECISION-REGISTER FR-004 y PROD-003.
 */

export interface WorkshopApiError {
  status?: number;
  message?: string;
  code?: string;
}

function status(error: unknown): number | undefined {
  return (error as WorkshopApiError)?.status;
}

function message(error: unknown): string {
  return ((error as WorkshopApiError)?.message ?? "").toLowerCase();
}

function code(error: unknown): string | undefined {
  return (error as WorkshopApiError)?.code;
}

/** Carga del detalle del taller (GET /workshops/:id). */
export function resolveWorkshopDetailError(error: unknown): string {
  const s = status(error);

  if (s === 403) {
    return "No tenés acceso a este taller. Tu membresía puede no estar activa.";
  }
  if (s === 404) {
    return "El taller no existe o fue eliminado.";
  }
  if (s === 401) {
    return "Tu sesión expiró. Volvé a iniciar sesión.";
  }
  if (s && s >= 500) {
    return "Error interno del servidor. Intentá más tarde.";
  }
  return "No se pudo cargar la información del taller. Intentá nuevamente.";
}

/** Guardado del perfil del taller (PATCH /workshops/:id). */
export function resolveUpdateWorkshopError(error: unknown): string {
  const s = status(error);
  const c = code(error);

  if (s === 409 || c === "CONFLICT") {
    const m = message(error);
    if (m.includes("cuit") || m.includes("taxid") || m.includes("tax_id")) {
      return "Ya existe otro taller con ese CUIT.";
    }
    if (m.includes("nombre") || m.includes("name")) {
      return "Ya existe otro taller con ese nombre.";
    }
    return "Ya existe un taller registrado con esos datos.";
  }
  if (s === 400 || s === 422) {
    return "Revisá los datos ingresados e intentá nuevamente.";
  }
  if (s === 403) {
    return "Necesitás permiso de administrador del taller para editar estos datos.";
  }
  if (s === 404) {
    return "El taller ya no existe o fue eliminado.";
  }
  if (s === 401) {
    return "Tu sesión expiró. Volvé a iniciar sesión.";
  }
  if (s && s >= 500) {
    return "Error interno del servidor. Intentá más tarde.";
  }
  return "No se pudieron guardar los datos del taller. Intentá nuevamente.";
}

/** Alta de sucursal (POST /workshops/:id/branches). */
export function resolveCreateBranchError(error: unknown): string {
  const s = status(error);

  if (s === 400 || s === 422) {
    return "Revisá los datos de la sucursal e intentá nuevamente.";
  }
  if (s === 403) {
    return "Necesitás permiso de administrador del taller para agregar sucursales.";
  }
  if (s === 404) {
    return "El taller ya no existe o fue eliminado.";
  }
  if (s === 401) {
    return "Tu sesión expiró. Volvé a iniciar sesión.";
  }
  if (s && s >= 500) {
    return "Error interno del servidor. Intentá más tarde.";
  }
  return "No se pudo agregar la sucursal. Intentá nuevamente.";
}