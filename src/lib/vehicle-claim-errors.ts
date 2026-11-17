/**
 * F-1/F-2 — mapeo de errores del módulo de reclamo de vehículo (contrato
 * backend congelado, spec `vehicle-claim-copy.md` §1.11 / §2.14 / §4).
 *
 * El frontend NUNCA muestra el mensaje crudo del backend (§0 regla 6): cada
 * error se clasifica internamente y se resuelve a copy de UI aprobado. El
 * `message` del backend se usa SOLO como señal de clasificación (los 409
 * distinguen variantes por mensaje, mismo `code` — patrón
 * invitation-errors.ts D-S3).
 *
 * Errores de la API pública (por status + code/message):
 * - sin status       → red/timeout (ky)              → copy de conexión
 * - 400 VALIDATION_ERROR → formato de patente        → copy §1.3
 * - 400 (otro)       → verificación fallida (único)  → copy §1.6
 * - 401 TICKET_EXPIRED → ticket vencido (20 min)     → terminal §1.11
 * - 401 (otro)       → AUTH_REQUIRED (ky puede re-lanzar el error del
 *                      refresh en vez del original)  → paso cuenta §1.8
 * - 404              → link inválido                 → terminal §1.11
 * - 409 "Demasiados intentos" → lock temporal        → §1.7
 * - 409 "ya no está disponible" → link consumido     → refetch bootstrap
 * - 409 "titular registrado" → claim_blocked         → terminal §1.11
 * - 410 "ya no está vigente" → expired              → terminal §1.11
 * - 410 "revocó este link"  → revoked               → terminal §1.11
 * - 429              → throttle                      → terminal 429
 * - 5xx / otro       → genérico                      → terminal §1.11
 *
 * Errores del panel del taller (§2.14) se resuelven con
 * `resolveClaimPanelMessage`.
 */

// ---------------------------------------------------------------------------
// API pública — clasificación
// ---------------------------------------------------------------------------

export type ClaimPublicErrorKind =
  | "network"
  | "format"
  | "verify_failed"
  | "auth_required"
  | "ticket_expired"
  | "invalid"
  | "locked"
  | "unavailable"
  | "claim_blocked"
  | "expired"
  | "revoked"
  | "rate_limited"
  | "generic";

export interface ClaimApiError {
  status?: number;
  message?: string;
  code?: string;
  errors?: Record<string, unknown>;
}

/** Extrae el status HTTP de un error normalizado por `toApiError` (lib/api). */
export function claimErrorStatus(error: unknown): number | undefined {
  return (error as ClaimApiError)?.status;
}

/** Extrae el code del backend (solo para clasificar internamente). */
export function claimErrorCode(error: unknown): string | undefined {
  return (error as ClaimApiError)?.code;
}

function claimErrorMessage(error: unknown): string {
  return (error as ClaimApiError)?.message ?? "";
}

/** Extrae `errors.reason` del envelope del backend (D-025). */
function claimErrorReason(error: unknown): string | undefined {
  const errors = (error as ClaimApiError)?.errors;
  return typeof errors?.reason === "string" ? errors.reason : undefined;
}

/**
 * Clasifica un error de la API pública de reclamo (§4 del copy spec).
 *
 * Prioriza `status` + `code` (contrato) y usa el `message` SOLO para
 * distinguir variantes que comparten status/code (409 y 410).
 */
export function claimPublicErrorKind(error: unknown): ClaimPublicErrorKind {
  const status = claimErrorStatus(error);
  const code = claimErrorCode(error);
  const message = claimErrorMessage(error);
  const reason = claimErrorReason(error);

  // Sin status = red / timeout / error de parseo (ky no lanzó HTTPError).
  if (status === undefined) return "network";

  if (status === 400) {
    return code === "VALIDATION_ERROR" ? "format" : "verify_failed";
  }

  if (status === 401) {
    return code === "TICKET_EXPIRED" ? "ticket_expired" : "auth_required";
  }

  if (status === 404) return "invalid";

  if (status === 409) {
    if (message.includes("Demasiados intentos")) return "locked";
    if (message.includes("ya no está disponible")) return "unavailable";
    if (
      reason === "claim_blocked" ||
      message.includes("titular registrado")
    )
      return "claim_blocked";
    return "generic";
  }

  if (status === 410) {
    if (message.includes("revocó este link")) return "revoked";
    return "expired";
  }

  if (status === 429) return "rate_limited";

  return "generic";
}

// ---------------------------------------------------------------------------
// Copy de UI — inline (§1.3 / §1.6) y conectividad
// ---------------------------------------------------------------------------

/** §1.3 — campo con formato inválido (cliente y servidor). */
export const CLAIM_FORMAT_ERROR =
  "La patente no tiene un formato válido. Revisala e intentá de nuevo.";

/** §1.6 — mensaje ÚNICO de verificación fallida (anti-enumeración). */
export const CLAIM_VERIFY_ERROR =
  "No pudimos verificar los datos del vehículo. Revisá la patente y los datos ingresados.";

/** §1.3 — error de red genérico (también vale para challenge/verify). */
export const CLAIM_NETWORK_ERROR =
  "No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.";

/** Copy inline para un fallo de challenge/verify (nunca el crudo del backend). */
export function resolveClaimVerifyErrorMessage(error: unknown): string {
  const kind = claimPublicErrorKind(error);
  if (kind === "format") return CLAIM_FORMAT_ERROR;
  if (kind === "network") return CLAIM_NETWORK_ERROR;
  return CLAIM_VERIFY_ERROR;
}

// ---------------------------------------------------------------------------
// Copy de UI — pantallas terminales del wizard público (§1.7 / §1.11)
// ---------------------------------------------------------------------------

export type ClaimTerminalKind =
  | "expired"
  | "revoked"
  | "claimed"
  | "claim_blocked"
  | "invalid"
  | "generic"
  | "ticket_expired"
  | "locked"
  | "rate_limited";

export interface ClaimTerminalCopy {
  title: string;
  body: string;
  /** CTAs de la pantalla, resueltos por la UI según `kind`. */
  icon: "alert" | "lock";
  variant: "single" | "retry" | "recover";
}

/**
 * §1.11 (mismo componente ClaimError) + §1.7 lock + 429 (§1.7 reutilizado).
 *
 * - `single` → un CTA outline `Volver al inicio`.
 * - `retry`  → `Reintentar` (outline, RotateCcw) + `Volver al inicio` (ghost).
 * - `recover`→ `Verificar de nuevo` (default, refresca el bootstrap).
 */
export const CLAIM_TERMINAL_COPY: Record<ClaimTerminalKind, ClaimTerminalCopy> =
  {
    expired: {
      title: "El link venció",
      body: "Este link ya no está vigente. Pedile al taller que te genere uno nuevo.",
      icon: "alert",
      variant: "single",
    },
    revoked: {
      title: "El link fue revocado",
      body: "El taller o Autentia revocó este link. Contactá al taller para solicitar uno nuevo.",
      icon: "alert",
      variant: "single",
    },
    claimed: {
      title: "Este vehículo ya fue reclamado",
      body: "El historial de este vehículo ya está a nombre de otra persona. Si creés que es un error, contactá al taller.",
      icon: "alert",
      variant: "single",
    },
    claim_blocked: {
      title: "No pudimos completar el reclamo",
      body: "El vehículo ya tiene un titular registrado. Si creés que es un error, contactá al taller.",
      icon: "alert",
      variant: "single",
    },
    invalid: {
      title: "El link no es válido",
      body: "Revisá que hayas abierto el link completo que te envió el taller.",
      icon: "alert",
      variant: "single",
    },
    generic: {
      title: "No pudimos abrir el link",
      body: "Ocurrió un error al validar el link. Probá de nuevo en unos minutos.",
      icon: "alert",
      variant: "retry",
    },
    ticket_expired: {
      title: "Volvé a verificar",
      body: "Pasaron más de 20 minutos desde que verificaste el vehículo. Verificá de nuevo para continuar.",
      icon: "alert",
      variant: "recover",
    },
    locked: {
      title: "Demasiados intentos",
      body: "Por seguridad, bloqueamos la verificación por 30 minutos. Podés volver a intentar más tarde o contactar al taller.",
      icon: "lock",
      variant: "single",
    },
    rate_limited: {
      // Copy §4 (429). El título `Demasiados intentos` es la shell §1.7
      // reutilizada — ver flag en el reporte (no está literal en §4).
      title: "Demasiados intentos",
      body: "Hiciste demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.",
      icon: "lock",
      variant: "single",
    },
  };

/** Copy de una pantalla terminal del wizard público. */
export function claimTerminalCopy(
  kind: ClaimTerminalKind,
): ClaimTerminalCopy {
  return CLAIM_TERMINAL_COPY[kind];
}

// ---------------------------------------------------------------------------
// Copy de UI — panel del taller (§2.14 + §2.6)
// ---------------------------------------------------------------------------

/** §2.14 — sin permiso `vehicle-claim.*` en el taller. */
export const CLAIM_PANEL_NO_PERMISSION =
  "No tenés permiso para gestionar reclamos en este taller.";

/** §2.14 — 404 del detalle (invite inexistente o de otro taller). */
export const CLAIM_PANEL_NOT_FOUND = "No pudimos encontrar este reclamo.";

/** §2.14 — error de red/acción genérico (con retry en la UI). */
export const CLAIM_PANEL_ACTION_ERROR =
  "No pudimos completar la acción. Intentá de nuevo.";

/** §2.14 — QR no disponible (firma vencida / red al descargar). */
export const CLAIM_PANEL_QR_ERROR =
  "No pudimos cargar el QR. Generá un link nuevo o intentá de nuevo en unos minutos.";

/** §2.6 — cuerpo del callout cuando el vehículo ya tiene titular. */
export const CLAIM_PANEL_ALREADY_TAKEN =
  "Este vehículo ya tiene titular; no se envió invitación.";

/** §2.6 — helper bajo el callout. */
export const CLAIM_PANEL_ALREADY_TAKEN_HELPER =
  "Si el titular cambió, primero tenés que resolver la titularidad desde el vehículo.";

/** §2.14 — approve sin claimant vinculado (409 del backend). */
export const CLAIM_PANEL_APPROVE_NO_ACCOUNT =
  "Todavía no hay una cuenta vinculada a este reclamo.";

/** §2.14 — revoke sobre un invite en revisión manual (409 del backend). */
export const CLAIM_PANEL_REVOKE_MANUAL_REVIEW =
  "Este reclamo está en revisión manual. Para rechazarlo, usá Rechazar.";

/**
 * Copy de un fallo del panel (create/approve/reject/revoke/detalle).
 *
 * Prioriza las variantes con copy literal del spec (§2.14) por `message`,
 * después `status` (403/404) y cae al genérico de acción.
 */
export function resolveClaimPanelMessage(error: unknown): string {
  const message = claimErrorMessage(error);
  if (message.includes("Todavía no hay una cuenta vinculada")) {
    return CLAIM_PANEL_APPROVE_NO_ACCOUNT;
  }
  if (message.includes("está en revisión manual")) {
    return CLAIM_PANEL_REVOKE_MANUAL_REVIEW;
  }

  const status = claimErrorStatus(error);
  if (status === 403) return CLAIM_PANEL_NO_PERMISSION;
  if (status === 404) return CLAIM_PANEL_NOT_FOUND;

  return CLAIM_PANEL_ACTION_ERROR;
}

/**
 * §2.6 — detecta el 409 "vehículo con titular" del POST create.
 *
 * El backend distingue `already_claimed` / `active_owner` por
 * `errors.reason` (envelope D-025). Se clasifica por ese campo primero (deuda
 * reparada: antes se usaba el mensaje, frágil ante cambios de copy). Se mantiene
 * el fallback por mensaje para deploys viejos del backend que no envíen
 * `errors` (o para ky/errores normalizados sin envelope).
 *
 * En §2.1 el panel muestra el callout §2.6 y oculta el CTA de generar
 * (reintentar el POST siempre daría el mismo 409).
 */
export function isClaimAlreadyTaken(error: unknown): boolean {
  if (claimErrorStatus(error) !== 409) return false;
  const reason = claimErrorReason(error);
  if (reason === "already_claimed" || reason === "active_owner") return true;
  return claimErrorMessage(error).includes("ya tiene titular");
}
