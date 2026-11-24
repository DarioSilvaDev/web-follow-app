/**
 * F-020 + iteración 2-2 — CareEpisode frontend types.
 *
 * Alineado con el contrato del módulo `care-episodes` (spec F-020 §7 y spec
 * 2-2 §7):
 * - `GET /api/care-episodes/lookup?plate=` → datos mínimos del vehículo SIN PII
 *   (RF-2): `id`, `licensePlate`, `brand`, `model`, `version`,
 *   `manufactureYear`, `modelYear`.
 * - `POST /api/care-episodes` (check-in legacy, RF-1): body con `vehicleId`,
 *   `branchId` y opcionales del ingreso. El episodio nace en estado `open`.
 * - `POST /api/care-episodes/check-in` (B-2, vigente): recibe la PATENTE y
 *   resuelve vehículo (reutiliza o crea) + atención + contacto en una
 *   transacción.
 * - `GET /api/care-episodes/service-types` (B-2): catálogo de tipos de
 *   atención filtrado por especialidades del taller.
 * - `POST /api/care-episodes/owner` (RF-1 iteración 2-2): ruta PERSONAL del
 *   propietario; el `source` es constante del path (`owner`), nunca del body
 *   (D-063).
 * - `GET /api/care-episodes/verifications` (RF-4) y
 *   `POST /api/care-episodes/:id/verify` (RF-5): cola de verificaciones del
 *   taller (contexto WORKSHOP).
 *
 * El backend se implementa en paralelo con la spec; estos tipos solo reflejan
 * lo que consume la UI de esta iteración (F-021+ ampliará).
 */

/**
 * Origen del episodio (D-063: fijo e inmutable en la creación). Valores reales
 * del enum Prisma (minúsculas): `workshop` (flujo F-020) / `owner` (ruta
 * `/owner`).
 */
export type CareEpisodeSource = "workshop" | "owner";

/**
 * Nivel de confianza discreto (D-064): `unverified` → "Registrado por el
 * propietario"; `verified` → verificado por taller (solo talleres verifican);
 * `rejected` → el taller responsable indicó que el servicio no le corresponde
 * (estado terminal, diseño aprobado de rechazo de verificación).
 * D-209: el campo es `null` ("verificación no aplica") en episodios
 * `source='workshop'`; el enum aplica solo a episodios `source='owner'`.
 */
export type CareEpisodeVerification = "unverified" | "verified" | "rejected";

/** GET /api/care-episodes/lookup?plate= → vehículo para el check-in. */
export interface CareEpisodeLookupVehicle {
  id: string;
  licensePlate: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  manufactureYear: number | null;
  modelYear: number | null;
}

/**
 * @deprecated Endpoint viejo `POST /api/care-episodes` (recibe `vehicleId`).
 * El check-in unificado (`POST /api/care-episodes/check-in`, B-2) es el flujo
 * vigente: resuelve el vehículo por PATENTE y lo crea si no existe. Se conserva
 * el tipo/método porque el endpoint sigue existiendo en backend, pero la UI de
 * `/atenciones/nueva` ya no lo usa.
 */
export interface CreateCareEpisodeInput {
  vehicleId: string;
  branchId: string;
  appointmentId?: string;
  mileageIn?: number;
  customerComplaint?: string;
  customerNotes?: string;
}

// ---------------------------------------------------------------------------
// B-2 — Check-in unificado de taller (POST /api/care-episodes/check-in)
//
// Contrato verificado en `api-follow-app/src/modules/care-episodes/dto/
// check-in.dto.ts` + `commands/check-in/check-in.handler.ts`:
// - Recibe la PATENTE (no `vehicleId`); el server resuelve reutilizar o crear.
// - Odómetro XOR: `mileageIn` **o** (`mileageInUnreadable` + motivo ≥3).
// - Catálogo XOR texto libre por campo: `brandId`/`brandName`,
//   `modelId`/`modelName` (nunca ambos). `versionId` no se expone en esta UI.
// - `ownerPhone` opcional (par área/número; país fijo server-side).
// ---------------------------------------------------------------------------

/** Celular del propietario (dos inputs, sin país: lo fija el backend). */
export interface CheckInOwnerPhoneInput {
  areaCode?: string;
  nationalNumber?: string;
}

/** POST /api/care-episodes/check-in → body. */
export interface CheckInInput {
  licensePlate: string;
  branchId: string;
  /** Catálogo (solo si se crea el vehículo). */
  brandId?: string;
  modelId?: string;
  versionId?: string;
  /** Texto libre (solo si se crea el vehículo); XOR con el id del campo. */
  brandName?: string;
  modelName?: string;
  vin?: string;
  /** Odómetro: valor numérico XOR excepción "no legible" + motivo. */
  mileageIn?: number;
  mileageInUnreadable?: boolean;
  mileageInUnreadableReason?: string;
  customerComplaint?: string;
  customerNotes?: string;
  internalNotes?: string;
  /** Hasta 3 en total contando `customServiceLabel` ("Otro"). */
  serviceTypeIds?: string[];
  customServiceLabel?: string;
  ownerPhone?: CheckInOwnerPhoneInput;
}

/** Estado del contacto activo del propietario (`VehicleContactStatus` Prisma). */
export type VehicleContactStatus = "available" | "unavailable";

/** POST /api/care-episodes/check-in → `{ data }` (CheckInData del handler). */
export interface CheckInResult {
  careEpisodeId: string;
  vehicleId: string;
  licensePlate: string;
  status: string;
  mileageIn: number | null;
  checkedInAt: string;
  /**
   * Fuente de verdad del mensaje de éxito: `true` si el server creó el
   * vehículo en esta transacción (no la rama local del lookup).
   */
  vehicleCreated: boolean;
  ownerContact: {
    status: VehicleContactStatus;
    /** Teléfono enmascarado (`••••2268`) o `null` si no hay canal. */
    phoneMasked: string | null;
  };
}

/** Envelope de la respuesta del check-in. */
export interface CheckInResponse {
  data: CheckInResult;
}

/** Item de `GET /api/care-episodes/service-types`. */
export interface ServiceType {
  id: string;
  code: string;
  name: string;
}

/**
 * GET /api/care-episodes/service-types → catálogo activo filtrado por las
 * especialidades del taller. Sin especialidades → catálogo completo +
 * `onboardingRequired: true` (aviso de onboarding, no bloquea).
 */
export interface ServiceTypesResponse {
  data: ServiceType[];
  onboardingRequired: boolean;
}

/**
 * POST /api/care-episodes/owner — body del propietario (RF-1, iteración 2-2).
 * XOR del taller responsable (D-066): `workshopId` (taller de la app) **o**
 * `workshopName` (texto libre), nunca ambos (el backend responde 400 si el XOR
 * no se cumple).
 */
export interface CreateOwnerCareEpisodeInput {
  vehicleId: string;
  title: string;
  /** Fecha del servicio, ISO date `YYYY-MM-DD` (no futura, RF-1). */
  serviceDate: string;
  workshopId?: string;
  workshopName?: string;
  mileageIn?: number;
  notes?: string;
}

/**
 * POST /api/care-episodes → 201 con el episodio `open`. Subset leído por la UI.
 * Los campos de la iteración 2-2 (`source`, `verification`, campos owner) son
 * opcionales: el flujo WORKSHOP de F-020 no los expone en la respuesta.
 */
export interface CareEpisode {
  id: string;
  vehicleId: string;
  workshopId: string;
  branchId: string;
  status: "open" | "delivered" | "cancelled";
  mileageIn: number | null;
  customerComplaint: string | null;
  customerNotes: string | null;
  checkedInAt: string;
  createdAt: string;
  /** Iteración 2-2 (D-063): `source='owner'` en la ruta `/owner`. */
  source?: CareEpisodeSource;
  /** Iteración 2-2 (D-064): `verification='unverified'` al nacer en episodios
   * `source='owner'`. `null` en episodios `source='workshop'` (D-209: la
   * verificación no aplica — el taller no se auto-verifica). */
  verification?: CareEpisodeVerification | null;
  /** Iteración 2-2 (RF-1): requerido en episodios owner. */
  title?: string | null;
  /** Iteración 2-2 (RF-1): requerido en episodios owner (pasada/hoy). */
  serviceDate?: string | null;
  /** Iteración 2-2 (D-066): texto libre XOR `workshopId`. */
  workshopName?: string | null;
  /** Iteración 2-2 (RF-1): autor propietario (auditoría). */
  createdByUserId?: string | null;
}

/**
 * GET /api/care-episodes/verifications — item de la cola de verificaciones del
 * taller (RF-4, iteración 2-2). Solo episodios `source='owner'` +
 * `verification='unverified'` + `workshopId = contexto`, orden `serviceDate`
 * asc (≤50 default). PII mínima: `owner` sin email/teléfono.
 */
export interface CareEpisodeVerificationItem {
  id: string;
  /** Vehículo del episodio — deep-link al detalle (`/vehicles/:id/servicios/:id`). */
  vehicleId: string;
  title: string;
  /** Plan 05 / F-TZ-11: `YYYY-MM-DD` (date-only) o `null` si no se declaró. */
  serviceDate: string | null;
  mileageIn: number | null;
  notes: string | null;
  vehicle: {
    licensePlate: string;
    brand: string | null;
    model: string | null;
    version: string | null;
    manufactureYear: number | null;
  };
  owner: {
    firstName: string;
    lastName: string;
  };
}

/**
 * POST /api/care-episodes/:id/reject → 200 (contrato fijado del diseño
 * aprobado de rechazo de verificación). Body `{ reason?: string }` (≤500,
 * opcional). Errores: 403 (sin permiso / `source=workshop`), 404
 * (ajeno/inexistente), 409 (ya `verified` u otro estado terminal).
 */
export interface RejectCareEpisodeResult {
  id: string;
  verification: "rejected";
  rejectedByMemberId: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
}

// ---------------------------------------------------------------------------
// B-3 — Cierre de atención (POST /api/care-episodes/:id/close)
//
// Contrato verificado en `api-follow-app/src/modules/care-episodes/dto/
// close-care-episode.dto.ts` + `commands/close-care-episode/…handler.ts`:
// - Odómetro de egreso XOR excepción "no legible" + motivo (3..200).
// - `closeNotes` OBLIGATORIO (10..1000, D-207): diagnóstico / resumen.
// - `serviceTypeIds` / `customServiceLabel` son ADITIVOS sobre los tipos del
//   check-in (ADR-005). El MVP no los envía: el check-in ya carga ≥1.
// - `mileageOut < mileageIn` → 400. `mileageOut < máximo histórico` → NO
//   bloquea; la respuesta informa `mileageOutlier: true`.
// ---------------------------------------------------------------------------

/** POST /api/care-episodes/:id/close → body. */
export interface CloseCareEpisodeInput {
  /** Odómetro de egreso (entero ≥ 0). Mutuamente excluyente con la excepción. */
  mileageOut?: number;
  /** `true` → reemplaza a `mileageOut` y exige motivo + foto `after` vigente. */
  mileageOutUnreadable?: boolean;
  /** 3..200 caracteres; solo cuando `mileageOutUnreadable === true`. */
  mileageOutUnreadableReason?: string;
  /** Aditivo sobre los tipos ya cargados en el check-in (no se envía en el MVP). */
  serviceTypeIds?: string[];
  /** 3..120 caracteres; opción "Otro". */
  customServiceLabel?: string;
  /** Diagnóstico / resumen obligatorio (10..1000 caracteres, D-207). */
  closeNotes: string;
}

/** Payload interno de la respuesta de cierre. */
export interface CloseCareEpisodeResult {
  id: string;
  status: "delivered";
  closedAt: string;
  mileageOut: number | null;
  mileageOutUnreadable: boolean;
  /** Egreso menor al máximo histórico: no bloquea, se informa para la UI. */
  mileageOutlier: boolean;
}

/** POST /api/care-episodes/:id/close → envelope `{ data }`. */
export interface CloseCareEpisodeResponse {
  data: CloseCareEpisodeResult;
}

// ---------------------------------------------------------------------------
// Iteración 2-4 — Evidencia del episodio (S1..S6)
// GET /api/care-episodes/:id (+?signed=true), POST/:id/attachments,
// DELETE/:id/attachments/:attachmentId, POST /api/care-episodes/owner (multipart).
// ---------------------------------------------------------------------------

/**
 * Fase del adjunto de evidencia (S1/S4):
 * - "before" | "work" | "after" — evidencia del taller (fase de la atención).
 * - null — evidencia del propietario en la creación multipart (grupo General
 *   en el detalle, consistente con S1).
 */
export type CareEpisodeAttachmentPhase = "before" | "work" | "after" | null;

/**
 * Motivo de eliminación auditada (S5). El backend valida la enum real
 * (`duplicada | sin_valor | privacidad | otro`) en el body opcional de DELETE.
 */
export type RemovedAttachmentReason =
  | "duplicada"
  | "sin_valor"
  | "privacidad"
  | "otro";

/** Límites de evidencia espejo del backend (S4/S6, defensa en profundidad). */
export const CARE_EPISODE_ATTACHMENT_LIMITS = {
  /** Tope global de adjuntos activos por episodio. */
  maxTotal: 15,
  /** Máximo lote por request (backend: MAX_OWNER_CREATION_FILES / FilesInterceptor). */
  maxBatch: 5,
  /** Máximo por archivo (multer limits.fileSize). */
  maxFileSizeBytes: 5 * 1024 * 1024,
} as const;

/**
 * GET /api/care-episodes/:id — item del galería de evidencia (AttachmentDto,
 * contrato congelado S1). `url`/`expiresAt` SOLO aparecen con ?signed=true;
 * los adjuntos removidos NO se listan (tombstones server-side), por eso
 * `removed` viaja siempre `false` en las listas activas.
 */
export interface CareEpisodeAttachment {
  id: string;
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  phase: CareEpisodeAttachmentPhase;
  uploadedByMemberId: string | null;
  uploadedByUserId: string | null;
  removed: boolean;
  createdAt: string;
  /** Solo presente cuando el detalle se pidió con ?signed=true. */
  url?: string;
  expiresAt?: string;
}

/** Agrupación por fase que devuelve el backend (S1): antes/trabajo/después/general. */
export interface CareEpisodeAttachmentGroups {
  before: CareEpisodeAttachment[];
  work: CareEpisodeAttachment[];
  after: CareEpisodeAttachment[];
  other: CareEpisodeAttachment[];
}

/**
 * GET /api/care-episodes/:id (+?signed=true) → CareEpisodeDetailResponseDto (S1).
 *
 * Proyección por actor (defense in depth aplicada en el mapping del backend):
 * - taller del episodio → `customerComplaint` + `internalNotes` visibles;
 * - dueño vigente       → `customerComplaint` visible, `internalNotes` null;
 * - shared/neutral      → ambos omitidos/null (nunca fuga PII).
 *
 * El backend puede OMITIR campos de proyección en lugar de enviar null → los
 * campos son opcionales y la UI renderiza defensivamente (`?? null`).
 */
export interface CareEpisodeDetail {
  id: string;
  vehicleId: string;
  vehicle: {
    id: string;
    licensePlate: string;
    brand: string | null;
    model: string | null;
    manufactureYear: number | null;
    /**
     * D-TL-VC-9 regla 2 (copy §2.6): `true` si el vehículo ya tiene un
     * `VehicleOwnership` primario activo (`endsAt: null`, `type <> 'co_owner'`).
     * Sin PII del titular. Deploy viejo del backend puede omitirlo → usar
     * `=== true`. El panel lo usa para no ofrecer "Generar link de reclamo"
     * (el POST create responde 409 `active_owner`).
     */
    hasActiveOwner?: boolean;
  };
  status: "open" | "delivered" | "cancelled";
  source: CareEpisodeSource;
  /** D-209/D-071: `null` en episodios `source='workshop'` (verificación no aplica). */
  verification: CareEpisodeVerification | null;
  /** Contrato rechazo (aditivo): presente cuando `verification='rejected'`. */
  rejectionReason?: string | null;
  rejectedAt?: string | null;
  rejectedByMemberId?: string | null;
  title: string | null;
  serviceDate: string | null;
  workshopId: string | null;
  workshopName: string | null;
  mileageIn: number | null;
  /** Egreso registrado al cerrar (null si aún está abierto o no se pudo leer). */
  mileageOut: number | null;
  /** Excepción "odómetro no legible" usada en el cierre. */
  mileageOutUnreadable: boolean;
  /** Motivo de la excepción; presente cuando `mileageOutUnreadable === true`. */
  mileageOutUnreadableReason: string | null;
  /** Diagnóstico / resumen obligatorio del cierre (D-207). */
  closeNotes: string | null;
  /**
   * Tipos de atención ya registrados en el check-in (ADR-005). Solo lectura en
   * el cierre; el backend los resuelve con `code`/`name` del catálogo o
   * `customLabel` para la opción "Otro". Opcional por tolerancia a deploys
   * viejos del backend.
   */
  serviceTypes?: Array<{
    serviceTypeId: string;
    code: string | null;
    name: string | null;
    customLabel: string | null;
  }>;
  /** Proyección: solo taller del episodio y dueño; puede venir OCULTO. */
  customerComplaint?: string | null;
  customerNotes: string | null;
  /** Proyección: SOLO presente para el taller del episodio (nunca dueño/shared). */
  internalNotes?: string | null;
  checkedInAt: string | null;
  closedAt: string | null;
  createdAt: string;
  attachments: CareEpisodeAttachmentGroups;
  attachmentCount: number;
}

/**
 * Respuesta aditiva de POST /api/care-episodes/owner con multipart (S6):
 * el shape histórico del episodio quedó intacto + `attachments` +
 * `attachmentCount` (misma forma AttachmentDto del detalle).
 */
export interface CreateOwnerCareEpisodeResult extends CareEpisode {
  attachments: CareEpisodeAttachment[];
  attachmentCount: number;
}

// ---------------------------------------------------------------------------
// F-023 — Listado de atenciones del taller (GET /api/care-episodes)
// ---------------------------------------------------------------------------

/**
 * GET /api/care-episodes — item del listado de atenciones del taller (F-023
 * RF-4). Sin PII del propietario (D-F023-2) y sin campos internos
 * (internalNotes / customerComplaint / customerNotes): el `select` del
 * backend es explícito y excluye cualquier campo no listado.
 */
export interface CareEpisodeListItem {
  id: string;
  vehicleId: string;
  title: string | null;
  status: "open" | "delivered" | "cancelled";
  source: CareEpisodeSource;
  /** D-209/D-071: `null` en episodios `source='workshop'` (verificación no aplica). */
  verification: CareEpisodeVerification | null;
  /**
   * Fecha canónica D-070 pre-computada por el backend
   * (serviceDate ?? checkedInAt ?? createdAt). Siempre ISO no-null.
   */
  canonicalDate: string;
  /**
   * Plan 05 / B-TZ-7 + F-TZ-11: fecha calendario (`YYYY-MM-DD`) derivada de
   * `serviceDate`. `null`/ausente sii `serviceDate` es `null` (deploy viejo del
   * backend → el front cae a `formatDate(canonicalDate)`).
   */
  canonicalDateOnly?: string | null;
  mileageIn: number | null;
  vehicle: {
    licensePlate: string;
    brand: string | null;
    model: string | null;
    manufactureYear: number | null;
  };
}

/** Envelope meta, idéntico al patrón admin/vehicles. */
export interface CareEpisodeListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** GET /api/care-episodes → { data, meta }. */
export interface CareEpisodeListResponse {
  data: CareEpisodeListItem[];
  meta: CareEpisodeListMeta;
}
