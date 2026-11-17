/**
 * B-2 — Mapeo de errores del check-in unificado de taller
 * (`POST /api/care-episodes/check-in`) y del lookup por patente.
 *
 * Convención del repo (espejo de `transfer-errors.ts` / `care-episode-errors.ts`):
 * el frontend NUNCA expone el mensaje crudo del backend. Cada status se
 * normaliza a copy de UI en voseo rioplatense, derivado de los contratos
 * REALES verificados en `api-follow-app`:
 *
 * - 400 → validaciones del DTO/handler (odómetro XOR, >3 tipos, catálogo
 *   inexistente, VIN con formato inválido, marca/modelo id+texto a la vez,
 *   celular inválido). Se clasifica por el texto para ubicar el error en el
 *   campo correcto.
 * - 403 → contexto/permiso (`care-episode.create`) o sucursal de otro taller.
 * - 404 → la sucursal ya no existe (el vehículo nunca es 404: el check-in lo
 *   crea).
 * - 409 → VIN ya registrado en otro vehículo / VIN distinto del registrado /
 *   vehículo soft-deleted ("dado de baja"). La patente NUNCA da 409: el server
 *   reutiliza el vehículo.
 * - 5xx / sin status → servidor / red.
 */

export interface CheckInApiError {
  status?: number;
  message?: string;
  code?: string;
}

/** Campo del formulario donde se muestra el error (si aplica). */
export type CheckInErrorField =
  | "licensePlate"
  | "branchId"
  | "mileageIn"
  | "vin"
  | "brand"
  | "model"
  | "serviceTypes"
  | "ownerPhone";

export interface CheckInErrorInfo {
  message: string;
  /** Campo al que pertenece el error; ausente ⇒ error general del formulario. */
  field?: CheckInErrorField;
  /**
   * 409 de VIN / vehículo dado de baja: conservar los datos y devolver el foco
   * a la patente (el taller debe revisar el vehículo antes de reintentar).
   */
  focusPlate?: boolean;
}

function statusOf(error: unknown): number | undefined {
  return (error as CheckInApiError)?.status;
}

function lowerMessage(error: unknown): string {
  return ((error as CheckInApiError)?.message ?? "").toLowerCase();
}

/** Copy de UI del check-in (voseo, sin texto crudo del backend). */
export const CHECK_IN_MESSAGES = {
  branchNotFound: "La sucursal seleccionada ya no existe. Elegí otra.",
  branchForbidden: "Esa sucursal no pertenece a tu taller.",
  permissions: "No tenés permisos para registrar atenciones en este taller.",
  sessionExpired: "Tu sesión expiró. Volvé a iniciar sesión.",
  vehicleDeleted:
    "Esa patente pertenece a un vehículo eliminado de la plataforma. No podemos registrar la atención.",
  vinOtherVehicle:
    "El VIN ya está registrado en otro vehículo. Revisá el número o dejalo vacío.",
  vinMismatch:
    "El VIN no coincide con el vehículo registrado para esa patente. Revisá el número.",
  vinInvalid: "El VIN tiene 17 caracteres, sin I, O ni Q.",
  mileage: "Cargá el kilometraje o marcá que no se puede leer.",
  mileageReason: "Contanos por qué no se puede leer (mínimo 3 caracteres).",
  serviceTypes:
    "Uno o más tipos de atención ya no están disponibles. Revisá la selección.",
  serviceTypesMax:
    "Llegaste al máximo de 3 tipos de atención. Quitá uno para agregar otro.",
  brand: "La marca seleccionada ya no está disponible. Elegí otra.",
  model: "El modelo seleccionado no pertenece a la marca. Revisá la selección.",
  ownerPhone: "Ingresá un celular válido (código de área y número).",
  plateInvalid: "La patente debe tener entre 2 y 10 caracteres alfanuméricos.",
  invalid: "Revisá los datos del formulario e intentalo de nuevo.",
  conflict: "No se pudo registrar la atención por un conflicto de datos.",
  server:
    "El servidor tuvo un problema. Intentalo nuevamente en unos segundos.",
  rateLimited:
    "Hiciste muchos intentos seguidos. Esperá unos segundos e intentá de nuevo.",
  network:
    "No se pudo conectar con el servidor. Revisá tu conexión e intentalo nuevamente.",
} as const;

/** Copy del lookup por patente: cualquier fallo ofrece reintentar, nunca crear. */
export const LOOKUP_ERROR_MESSAGE =
  "No pudimos buscar la patente. Intentalo de nuevo.";

export const LOOKUP_RATE_LIMIT_MESSAGE =
  "Demasiadas búsquedas. Esperá unos segundos e intentá de nuevo.";

/** 409: clasifica el conflicto por el texto del handler (contrato verificado). */
function resolveConflict(error: unknown): CheckInErrorInfo {
  const text = lowerMessage(error);
  if (text.includes("dado de baja") || text.includes("eliminado")) {
    return {
      message: CHECK_IN_MESSAGES.vehicleDeleted,
      field: "licensePlate",
      focusPlate: true,
    };
  }
  if (text.includes("vin no coincide")) {
    return {
      message: CHECK_IN_MESSAGES.vinMismatch,
      field: "vin",
      focusPlate: true,
    };
  }
  if (text.includes("vin ya registrado") || text.includes("vin")) {
    return {
      message: CHECK_IN_MESSAGES.vinOtherVehicle,
      field: "vin",
      focusPlate: true,
    };
  }
  return { message: CHECK_IN_MESSAGES.conflict, focusPlate: true };
}

/** 400: clasifica la validación del backend para ubicarla en el campo. */
function resolveBadRequest(error: unknown): CheckInErrorInfo {
  const text = lowerMessage(error);
  if (
    text.includes("odómetro") ||
    text.includes("odometro") ||
    text.includes("no se puede leer")
  ) {
    return { message: CHECK_IN_MESSAGES.mileage, field: "mileageIn" };
  }
  if (text.includes("motivo")) {
    return { message: CHECK_IN_MESSAGES.mileageReason, field: "mileageIn" };
  }
  if (text.includes("tipo") || text.includes("tipos")) {
    return { message: CHECK_IN_MESSAGES.serviceTypes, field: "serviceTypes" };
  }
  if (text.includes("vin")) {
    return { message: CHECK_IN_MESSAGES.vinInvalid, field: "vin" };
  }
  if (
    text.includes("celular") ||
    text.includes("teléfono") ||
    text.includes("telefono")
  ) {
    return { message: CHECK_IN_MESSAGES.ownerPhone, field: "ownerPhone" };
  }
  if (text.includes("patente") || text.includes("patente")) {
    return { message: CHECK_IN_MESSAGES.plateInvalid, field: "licensePlate" };
  }
  if (text.includes("marca")) {
    return { message: CHECK_IN_MESSAGES.brand, field: "brand" };
  }
  if (text.includes("modelo")) {
    return { message: CHECK_IN_MESSAGES.model, field: "model" };
  }
  return { message: CHECK_IN_MESSAGES.invalid };
}

/**
 * Normaliza un error del check-in a copy de UI + campo. Nunca devuelve el
 * mensaje crudo del backend.
 */
export function resolveCheckInError(error: unknown): CheckInErrorInfo {
  const status = statusOf(error);

  if (status === 409) {
    return resolveConflict(error);
  }

  if (status === 400) {
    return resolveBadRequest(error);
  }

  if (status === 404) {
    return { message: CHECK_IN_MESSAGES.branchNotFound, field: "branchId" };
  }

  if (status === 403) {
    const text = lowerMessage(error);
    if (text.includes("branch") || text.includes("sucursal")) {
      return { message: CHECK_IN_MESSAGES.branchForbidden, field: "branchId" };
    }
    return { message: CHECK_IN_MESSAGES.permissions };
  }

  if (status === 401) {
    return { message: CHECK_IN_MESSAGES.sessionExpired };
  }

  if (status === 429) {
    return { message: CHECK_IN_MESSAGES.rateLimited };
  }

  if (status !== undefined && status >= 500) {
    return { message: CHECK_IN_MESSAGES.server };
  }

  if (status === undefined) {
    return { message: CHECK_IN_MESSAGES.network };
  }

  return { message: CHECK_IN_MESSAGES.invalid };
}

/**
 * Copy del lookup por patente. El AC exige el mismo mensaje para red/5xx/429 y
 * ofrecer Reintentar — NUNCA ofrecer crear. Para 429 se agrega el detalle de
 * rate limit como línea secundaria (más accionable, mismo encabezado).
 */
export function resolveLookupErrorMessage(error: unknown): {
  message: string;
  detail?: string;
} {
  if (statusOf(error) === 429) {
    return {
      message: LOOKUP_ERROR_MESSAGE,
      detail: LOOKUP_RATE_LIMIT_MESSAGE,
    };
  }
  return { message: LOOKUP_ERROR_MESSAGE };
}
