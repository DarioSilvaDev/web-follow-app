/**
 * Tipos del workspace admin de plataforma — secciones concesionarias, talleres
 * y usuarios de plataforma (features D-106 — decisiones PM cerradas).
 *
 * Contrato backend congelado:
 * - GET  /api/admin/dealerships?page&limit&status
 * - POST /api/admin/dealerships  { name, taxId?, ownerEmail }
 * - POST /api/admin/dealerships/:id/invitations (reenvío)
 * - GET  /api/admin/dealerships/:id (detalle admin, DealershipDetailAdminResponseDto)
 * - PATCH /api/admin/dealerships/:id { identidad/contacto } (handoff PM Fase 3,
 *           P1) → devuelve el detalle actualizado (P7). Fase 1 backend:
 *           ENDPOINT COMPROMETIDO, aún no implementado en el controller.
 * - PATCH /api/admin/dealerships/:id/status { isActive } (P2/P3) → devuelve el
 *           detalle actualizado (P7). Fase 1 backend: ENDPOINT COMPROMETIDO,
 *           aún no implementado en el controller.
 * - GET  /api/admin/workshops?page&limit&status
 * - POST /api/admin/workshops  { name, taxId?, ownerEmail }
 * - POST /api/admin/workshops/:id/invitations (reenvío)
 * - GET  /api/admin/workshops/:id (detalle admin con branches + members)
 * - PATCH /api/admin/workshops/:id/status { isActive }
 *
 * Sección Usuarios (D-106, contrato backend VERIFICADO administration module):
 * - GET    /admin/users?page&limit&q&status&role
 *           → { data: UserAdminResponseDto[], meta: { total, page, limit, totalPages } }
 * - GET    /admin/users/:id → UserDetailAdminResponseDto (roles + cuenta status)
 * - POST   /admin/users → InvitePlatformUserDto { email, roleType:'admin'|'support',
 *           firstName?, lastName? } → user activo: asigna rol directo; pending/sin
 *           cuenta: crea invitación (wizard público la activa)
 * - PATCH  /admin/users/:id/status → UpdateUserStatusDto { status: UserStatus }
 * - POST   /admin/roles/assign | DELETE /admin/roles/revoke → { userId, roleId }
 *           (UUIDs; la API NO recibe roleType en assign/revoke — drift vs plan
 *           inicial, corregido contra código real)
 * - GET    /admin/roles → SystemRoleResponseDto[] (resuelve roleType → roleId)
 *
 * El prefijo `admin/*` NO inyecta headers de contexto (workspace PLATFORM).
 */

export type AdminDealershipStatus = "pending_claim" | "active";

/** `GET /api/admin/dealerships` → item del envelope. */
export interface AdminDealershipItem {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: AdminDealershipStatus;
  isActive: boolean;
  createdAt: string;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  invitation: {
    id: string;
    status: string;
    expiresAt: string;
  } | null;
  memberCount: number;
}

export interface AdminDealershipListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** `GET /api/admin/dealerships` → envelope { data, meta }. */
export interface AdminDealershipListResponse {
  data: AdminDealershipItem[];
  meta: AdminDealershipListMeta;
}

/** `POST /api/admin/dealerships` → body (nombre*, CUIT opcional, email dueño*). */
export interface CreateAdminDealershipInput {
  name: string;
  taxId?: string;
  ownerEmail: string;
}

/** `POST /api/admin/dealerships` → 201. */
export interface CreateAdminDealershipResult {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  status: "pending_claim";
  isActive: boolean;
  createdAt: string;
  invitation: {
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  };
}

/** `POST /api/admin/dealerships/:id/invitations` → 200 (reenvío). */
export interface ResendInvitationResult {
  invitation: {
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  };
}

/* ------------------------------------------------------------------ */
/* Talleres (admin) — espejo D-106 de concesionarias                   */
/* ------------------------------------------------------------------ */

export type AdminWorkshopStatus = "pending_claim" | "active";

/** `GET /api/admin/workshops` → item del envelope (WorkshopAdminResponseDto). */
export interface AdminWorkshopItem {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: AdminWorkshopStatus;
  isActive: boolean;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  invitation: {
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  } | null;
  claimedAt: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  branchesCount: number;
  membersCount: number;
  createdAt: string;
}

/** `GET /api/admin/workshops` → envelope { data, meta }. */
export interface AdminWorkshopListResponse {
  data: AdminWorkshopItem[];
  meta: AdminDealershipListMeta;
}

/** `POST /api/admin/workshops` → body (nombre*, CUIT opcional, email dueño*). */
export interface CreateAdminWorkshopInput {
  name: string;
  taxId?: string;
  ownerEmail: string;
}

/** `POST /api/admin/workshops` → 201 (espejo de concesionarias). */
export interface CreateAdminWorkshopResult {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  status: "pending_claim";
  isActive: boolean;
  createdAt: string;
  invitation: {
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  };
}

/** `POST /api/admin/workshops/:id/invitations` → 200 (reenvío). */
export interface ResendWorkshopInvitationResult {
  invitation: {
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  };
}

/** Sucursal dentro del detalle admin (WorkshopBranchAdminResponseDto). */
export interface AdminWorkshopBranch {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  street: string | null;
  streetNumber: string | null;
  city: string | null;
  state: string | null;
  isHeadquarters: boolean;
  isActive: boolean;
}

/** Miembro dentro del detalle admin (WorkshopMemberBriefDto). */
export interface AdminWorkshopMember {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  roleCode: string;
  roleName: string;
  status: string;
  joinedAt: string;
}

/** `GET /api/admin/workshops/:id` → 200 (WorkshopDetailAdminResponseDto). */
export interface AdminWorkshopDetail {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  description: string | null;
  status: AdminWorkshopStatus;
  isActive: boolean;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
  branches: AdminWorkshopBranch[];
  members: AdminWorkshopMember[];
}

/** `PATCH /api/admin/workshops/:id/status` → body. */
export interface UpdateAdminWorkshopStatusInput {
  isActive: boolean;
}

/* ------------------------------------------------------------------ */
/* Usuarios de plataforma (admin) — D-106, panel admin                 */
/*                                                                     */
/* Contrato backend VERIFICADO (administration module):                */
/* - GET  /admin/users?page&limit&q&status&role → { data, meta }       */
/* - GET  /admin/users/:id → UserDetailAdminResponseDto                */
/* - PATCH /admin/users/:id/status { status: UserStatus }              */
/* - POST /admin/users { email, roleType:'admin'|'support',            */
/*           firstName?, lastName? } → invite + asigna rol             */
/* - POST /admin/roles/assign { userId, roleId } (UUID system role)    */
/* - DELETE /admin/roles/revoke { userId, roleId }                     */
/* - GET  /admin/roles → SystemRoleResponseDto[]                       */
/*                                                                     */
/* OJO (drift corregido): assign/revoke usan `roleId` (UUID), NUNCA     */
/* `roleType`. El roleType solo aplica al invite (InvitePlatformUserDto).*/
/* ------------------------------------------------------------------ */

/** Estado de una cuenta de plataforma (Prisma UserStatus). */
export type AdminUserStatus = "pending" | "active" | "suspended";

/** Rol breve dentro de un item/detalle de usuario admin (RoleDto). */
export interface AdminUserRoleItem {
  id: string;
  type: string;
  name: string;
}

/** `GET /admin/users` → item del envelope (UserAdminResponseDto). */
export interface AdminUserItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  createdAt: string;
  roles: AdminUserRoleItem[];
  /** Membresías de taller ACTIVAS (aditivo, contadores server-side). */
  workshopCount: number;
  /** Membresías de concesionaria ACTIVAS (aditivo). */
  dealershipCount: number;
  /** Tenencias vigentes de vehículos (endsAt null) (aditivo). */
  vehicleCount: number;
}

/** `GET /admin/users` → meta del envelope. */
export interface AdminUserListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** `GET /admin/users` → envelope { data, meta }. */
export interface AdminUserListResponse {
  data: AdminUserItem[];
  meta: AdminUserListMeta;
}

/** Filtros de `GET /admin/users` (query string del controller). */
export interface ListAdminUsersInput {
  page?: number;
  limit?: number;
  q?: string;
  status?: AdminUserStatus | string;
  role?: AdminUserPlatformRoleFilter | string;
  /** Filtro por vínculo con el ecosistema (400 si inválido). */
  membership?: AdminUserMembershipFilter;
}

/** `GET /admin/users/:id` → UserDetailAdminResponseDto. */
export interface AdminUserDetail extends AdminUserItem {
  phone: string | null;
  avatarUrl: string | null;
  language: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  updatedAt: string;
  /** Membresías de taller vigentes (pending/active/suspended; NO inactivas). Aditivo. */
  workshopMemberships: AdminUserWorkshopMembership[];
  /** Membresías de concesionaria vigentes (NO inactivas). Aditivo. */
  dealershipMemberships: AdminUserDealershipMembership[];
  /** Historial de membresías de taller dadas de baja (opcional; default []). Aditivo. */
  inactiveWorkshopMemberships?: AdminUserWorkshopMembership[];
  /** Historial de membresías de concesionaria dadas de baja (opcional; default []). Aditivo. */
  inactiveDealershipMemberships?: AdminUserDealershipMembership[];
  /** Tenencias vigentes (endsAt null). Aditivo. */
  vehicles: AdminUserVehicleSummary[];
  /** Accesos vigentes (no revocados, no expirados). Aditivo. */
  vehicleAccesses: AdminUserVehicleAccess[];
}

/** `PATCH /admin/users/:id/status` → body (UserStatus de Prisma). */
export interface UpdateAdminUserStatusInput {
  status: AdminUserStatus;
}

/** `POST /admin/users` → body (invite platform user; solo admin|support). */
export interface InvitePlatformUserInput {
  email: string;
  roleType: "admin" | "support";
  firstName?: string;
  lastName?: string;
}

/**
 * `POST /admin/users` → resultado (InvitePlatformUserHandler).
 * roleAssigned=true → user activo (asignación directa, sin wizard);
 * roleAssigned=false → invitation creada (el wizard claim activa la cuenta).
 */
export interface InvitePlatformUserResult {
  roleAssigned: boolean;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
  } | null;
  role: { type: string; name: string };
  invitation: {
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  } | null;
}

/** `POST /admin/roles/assign` → body (userId + roleId UUID). */
export interface AssignSystemRoleInput {
  userId: string;
  roleId: string;
}

/** `DELETE /admin/roles/revoke` → body (userId + roleId UUID). */
export interface RevokeSystemRoleInput {
  userId: string;
  roleId: string;
}

/** `GET /admin/roles` → item (SystemRoleResponseDto). */
export interface AdminSystemRoleItem {
  id: string;
  type: string;
  name: string;
  description: string | null;
  priority: number;
}

/* ------------------------------------------------------------------ */
/* Concesionaria — detalle admin (D-106). Espejo AdminWorkshopDetail.  */
/*                                                                     */
/* Contrato VERIFICADO: `GET /admin/dealerships/:id` existe desde       */
/* D-106 (DealershipDetailAdminResponseDto).                            */
/* ------------------------------------------------------------------ */

/** Miembro dentro del detalle admin de concesionaria. */
export interface AdminDealershipMemberDetail {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  roleCode: string;
  roleName: string;
  status: string;
  joinedAt: string;
}

/** `GET /admin/dealerships/:id` → 200 (DealershipDetailAdminResponseDto). */
export interface AdminDealershipDetail {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  description: string | null;
  status: string;
  isActive: boolean;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  members: AdminDealershipMemberDetail[];
  invitation: {
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  } | null;
}

/**
 * `PATCH /api/admin/dealerships/:id` → body (handoff PM P1): edición de
 * identidad y contacto SOLO. PATCH parcial — el frontend envía únicamente los
 * campos modificados; los opcionales que se vacían se mandan como `null`
 * para limpiarlos.
 */
export type UpdateAdminDealershipInput = Partial<
  Pick<
    AdminDealershipDetail,
    | "name"
    | "legalName"
    | "taxId"
    | "email"
    | "phone"
    | "website"
    | "description"
  >
>;

/** `PATCH /api/admin/dealerships/:id/status` → body (P2, permiso P3). */
export interface UpdateAdminDealershipStatusInput {
  isActive: boolean;
}
/* ------------------------------------------------------------------ */
/* Panel de usuarios 360 (panel superadmin) — contrato backend VERIFICADO */
/* (working tree de api-follow-app, aditivo sobre contratos congelados). */
/* ------------------------------------------------------------------ */

/** Filtro por vínculo con el ecosistema en `GET /admin/users` (400 si inválido). */
export type AdminUserMembershipFilter =
  | "workshop"
  | "dealership"
  | "vehicle"
  | "none";

/** Filtro de rol de plataforma en `GET /admin/users` (400 si inválido). */
export type AdminUserPlatformRoleFilter = "admin" | "support";

/** Membresía de taller dentro de `GET /admin/users/:id`. */
export interface AdminUserWorkshopMembership {
  id: string;
  workshopId: string;
  workshopName: string;
  /** pending_claim | active (estado de la entidad). */
  workshopStatus: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  defaultBranchId: string | null;
  defaultBranchName: string | null;
  /** pending | active | inactive | suspended (estado de la membresía). */
  status: string;
  joinedAt: string;
  /** Baja suave (null en vigentes; fecha de baja en inactivas, o null en casos viejos). Aditivo. */
  leftAt?: string | null;
}

/** Membresía de concesionaria dentro de `GET /admin/users/:id`. */
export interface AdminUserDealershipMembership {
  id: string;
  dealershipId: string;
  dealershipName: string;
  dealershipStatus: string;
  dealershipIsActive: boolean;
  roleId: string;
  roleCode: string;
  roleName: string;
  /** pending | active | inactive | suspended (estado de la membresía). */
  status: string;
  joinedAt: string;
  /** Baja suave (null en vigentes; fecha de baja en inactivas, o null en casos viejos). Aditivo. */
  leftAt?: string | null;
}

/** Tenencia vigente de vehículo dentro de `GET /admin/users/:id`. */
export interface AdminUserVehicleSummary {
  /** id de la ownership (no del vehículo). */
  id: string;
  vehicleId: string;
  licensePlate: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  color: string | null;
  manufactureYear: number | null;
  /** owner | co_owner | company */
  ownershipType: string;
  startsAt: string;
  /** Nombre de la concesionaria si la tenencia es consignación (D-101/D-104). */
  dealershipName: string | null;
}

/** Acceso vigente a vehículo de terceros dentro de `GET /admin/users/:id`. */
export interface AdminUserVehicleAccess {
  id: string;
  vehicleId: string;
  licensePlate: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  color: string | null;
  expiresAt: string | null;
  grantedByName: string;
  grantedByEmail: string;
  createdAt: string;
}

/**
 * `POST /admin/{workshops|dealerships}/:id/members` — respuesta (Aditivo).
 * El backend devuelve la membresía cruda (+ campos del prisma member);
 * la UI solo consume `reactivated`:
 * - true  → existía una membresía inactive y se reactivó (joinedAt conservado; leftAt null).
 * - false → alta nueva.
 */
export interface AdminAddMemberResult {
  reactivated?: boolean;
}

/**
 * Miembro expuesto por `GET /admin/{workshops|dealerships}/:id/members`
 * (incluye inactivas; la UI distingue por `status`).
 */
export interface AdminMemberItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  /** pending | active | inactive | suspended */
  status: string;
  joinedAt: string;
}

/**
 * Rol de entidad expuesto por `GET /admin/{workshops|dealerships}/:id/roles`.
 * Payload crudo del backend (workshopRole/dealershipRole con `permissions`
 * embebidos); la UI solo consume id/code/name/description/priority.
 */
export interface AdminEntityRoleItem {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isSystem?: boolean;
  priority?: number;
}

/** `POST /admin/users/:id/impersonate` — 200 `{ user }` (setea cookie httpOnly). */
export interface ImpersonateUserResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: AdminUserRoleItem[];
  };
}
