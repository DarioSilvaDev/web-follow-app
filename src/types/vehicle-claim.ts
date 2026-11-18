/**
 * Tipos del módulo de reclamo de vehículo (F-1 página pública + F-2 panel).
 *
 * Contrato backend congelado (api-follow-app `src/modules/vehicle-claims/`,
 * spec `docs/designs/vehicle-claim-technical-design.md` §5):
 *
 * PÚBLICO (sin auth, throttle propio):
 * - GET  /api/vehicle-claims/public/:token              → {status, canVerify}
 * - GET  /api/vehicle-claims/public/:token/challenge    → {factor, options}
 * - POST /api/vehicle-claims/public/:token/verify       → verified|manual_review
 * - POST /api/vehicle-claims/public/:token/commit       → claimed|manual_review
 *
 * TALLER (contexto WORKSHOP + permisos `vehicle-claim.*`):
 * - POST   /api/vehicle-claims                          → create/reuse
 * - GET    /api/vehicle-claims?page&limit&status        → list + meta.counts
 * - GET    /api/vehicle-claims/:id                      → detail (+claimant)
 * - POST   /api/vehicle-claims/:id/approve|reject       → review
 * - POST   /api/vehicle-claims/:id/revoke               → revoke
 *
 * TODAS las respuestas vienen envueltas en `{data}` (el listado agrega
 * `meta`); el cliente (`vehicleClaimApi` en src/lib/api.ts) desenvuelve el
 * envoltorio. Las fechas viajan como string ISO (JSON) — acá se tipan como
 * `string`, no `Date`.
 *
 * NO inventar campos fuera de este archivo: si el backend cambia, cambia el
 * contrato y este types primero.
 */

/** Estados efectivos del invite (lazy expiry en backend). */
export type VehicleClaimStatus =
  | "pending"
  | "verification_required"
  | "verified"
  | "manual_review"
  | "claimed"
  | "claim_blocked"
  | "expired"
  | "revoked";

export type VehicleClaimRevokeReason =
  | "by_workshop"
  | "by_admin"
  | "manual_review_rejected"
  | "vehicle_deleted"
  | "max_attempts"
  | "dispute_lost";

export type VehicleClaimOutcome = "ownership_created" | "already_owner";

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/** GET /vehicle-claims/public/:token — sólo esto, sin datos del vehículo. */
export interface PublicClaimBootstrap {
  status: VehicleClaimStatus;
  canVerify: boolean;
}

export type ClaimFactor = "vin" | "mileage" | "manual_review";

export interface ClaimChallengeOption {
  id: string;
  label: string;
}

/** GET /vehicle-claims/public/:token/challenge?licensePlate= */
export interface ClaimChallenge {
  factor: ClaimFactor;
  options: ClaimChallengeOption[];
}

/** POST .../verify → verified (con ticket de 20 min) o manual_review. */
export type VerifyClaimResult =
  | { status: "verified"; ticket: string; expiresIn: number }
  | { status: "manual_review"; ticket: string };

/** POST .../commit → claimed (con outcome) o manual_review. */
export type CommitClaimResult =
  | { status: "claimed"; outcome: VehicleClaimOutcome }
  | { status: "manual_review" };

// ---------------------------------------------------------------------------
// API del taller
// ---------------------------------------------------------------------------

/**
 * POST /vehicle-claims — `link`/`whatsappUrl` sólo cuando se emitió token
 * nuevo (creación o reactivación); en la reutilización idempotente de un
 * invite vigente no se recuperan (el panel re-muestra el QR).
 */
export interface WorkshopClaimCreateData {
  id: string;
  vehicleId: string;
  licensePlate: string;
  status: VehicleClaimStatus;
  link?: string;
  whatsappUrl?: string | null;
  qrImageUrl: string | null;
  ownerPhone: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface WorkshopClaimListItem {
  id: string;
  vehicleId: string;
  licensePlate: string;
  status: VehicleClaimStatus;
  claimOutcome: VehicleClaimOutcome | null;
  ownerPhone: string | null;
  openedAt: string | null;
  verifiedAt: string | null;
  usedAt: string | null;
  failedAttempts: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

/** `counts` se computa en backend sobre TODOS los filas (pre-filtro). */
export interface WorkshopClaimListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  counts: Record<VehicleClaimStatus, number>;
}

export interface WorkshopClaimListResponse {
  data: WorkshopClaimListItem[];
  meta: WorkshopClaimListMeta;
}

export interface WorkshopClaimAttemptItem {
  id: string;
  outcome: string;
  createdAt: string;
}

export interface WorkshopClaimDetail {
  id: string;
  vehicleId: string;
  careEpisodeId: string | null;
  status: VehicleClaimStatus;
  claimOutcome: VehicleClaimOutcome | null;
  ownerPhone: string | null;
  claimantUserId: string | null;
  openedAt: string | null;
  verifiedAt: string | null;
  usedAt: string | null;
  failedAttempts: number;
  lastFailedAt: string | null;
  verificationLockedAt: string | null;
  lockoutCount: number;
  expiresAt: string;
  blockedAt: string | null;
  revokedAt: string | null;
  revokeReason: VehicleClaimRevokeReason | null;
  createdAt: string;
  updatedAt: string;
  qrImageUrl: string | null;
  attempts: WorkshopClaimAttemptItem[];
  vehicle: {
    licensePlate: string;
    brand: string | null;
    model: string | null;
    manufactureYear: number | null;
  };
  /**
   * Sólo lo expone el backend cuando el estado es `manual_review` y la
   * sesión tiene `vehicle-claim.review` (o es `super_admin`); el resto de los
   * estados lo devuelve `null` o ausente.
   */
  claimant?: {
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

/** POST :id/approve → claimed; POST :id/reject → revoked. */
export type WorkshopClaimReviewResult =
  | { status: "claimed"; outcome: VehicleClaimOutcome }
  | { status: "revoked"; reason: VehicleClaimRevokeReason };

export interface WorkshopClaimRevokeResult {
  status: "revoked";
  reason: VehicleClaimRevokeReason;
  ownershipUndone: boolean;
}
