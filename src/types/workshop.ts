/**
 * Workshop types expuestos al frontend (F-020).
 *
 * Fuente: `GET /api/workshops/:id` → `WorkshopResponseDto` (backend existente).
 * El endpoint exige membresía activa (o super_admin) y devuelve las branches
 * activas del taller (sede primero). Subset de `WorkshopBranch` (Prisma) que
 * serializa el backend.
 */

export interface WorkshopBranch {
  id: string;
  workshopId: string;
  name: string;
  phone: string | null;
  email: string | null;
  street: string | null;
  streetNumber: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  isHeadquarters: boolean;
  isActive: boolean;
}

/** GET /api/workshops/:id → WorkshopResponseDto (branches activas, sede primero). */
export interface WorkshopDetail {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  branches?: WorkshopBranch[];
  memberCount?: number;
  branchCount?: number;
}

/**
 * Iteración 2-2 (RF-3): `GET /api/workshops/search?q=` → resultado de la
 * búsqueda pública acotada de talleres (autenticado, SIN membresía).
 * Devuelve SOLO `id`/`name`/`logoUrl?`/`city` — sin taxId/email/branches
 * (PII mínima). Sin match → `[]`; `q` min 2 chars → 400.
 */
export interface WorkshopSearchResult {
  id: string;
  name: string;
  logoUrl?: string | null;
  city: string | null;
}

/**
 * Inputs de auto-servicio del taller (DECISION-REGISTER PROD-001).
 *
 * Contratos ya existentes en backend y hasta ahora no consumidos por el
 * frontend. Todos exigen `WorkshopGuard` + `PermissionsGuard`:
 * - `PATCH /workshops/:id`        → `workshop.update`      (seed: rol `owner`)
 * - `POST  /workshops/:id/branches` → `workshop.branch.create` (seed: rol `owner`)
 *
 * `PATCH` devuelve la entidad `Workshop` SIN `branches` embebidas: quien lo
 * consuma debe volver a pedir `getWorkshop` si necesita la lista de sucursales.
 */

/** PATCH /api/workshops/:id → `UpdateWorkshopDto` (PartialType de CreateWorkshopDto). */
export interface UpdateWorkshopInput {
  name?: string;
  legalName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  description?: string | null;
}

/** POST /api/workshops/:id/branches → `CreateBranchDto`. Solo `name` es obligatorio. */
export interface CreateBranchInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  /**
   * Sede principal. El backend NO valida unicidad: marcar una segunda sede
   * como principal es posible hoy. DECISION-REGISTER `BE-003` (pendiente)
   * define el índice único parcial; el frontend debe reducir la posibilidad,
   * no asumir la garantía.
   */
  isHeadquarters?: boolean;
}