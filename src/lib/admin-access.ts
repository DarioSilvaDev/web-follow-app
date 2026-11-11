import type { SessionUser } from "@/types/auth";

/**
 * GATES DE UX (NUNCA security boundary — AGENTS.md §22).
 *
 * Ambos helpers controlan navegación/visibilidad; el enforcement real vive en
 * el backend (permissions: admin.dashboard, admin.dealerships.*, ...).
 *
 * Contrato de sesión real (GET /auth/me → SessionUser):
 * - `roles[].type` es el SystemRoleType: "super_admin" | "admin" | "support" | "user".
 * - `roles[].permissions` solo se incluye cuando el backend lo puebla
 *   (RoleDto includePermissions=true); para super_admin es `["*"]`.
 */

/**
 * Gate de WORKSPACE: determina si el usuario puede ver el workspace admin en
 * su conjunto (/admin). Se mantiene como puerta única de entrada.
 */
export function hasAdminAccess(user: SessionUser | null | undefined): boolean {
  if (!user) return false;

  const roles = user.roles ?? [];
  if (
    roles.some(
      (role) => role.type === "super_admin" || role.type === "admin",
    )
  ) {
    return true;
  }

  const permissions = roles.flatMap((role) => role.permissions ?? []);
  return permissions.includes("*") || permissions.includes("admin.dashboard");
}

/**
 * Gate de SECCIÓN: evalúa un permiso puntual sobre la sesión del usuario.
 *
 * - `"*"` (super_admin según contrato /auth/me) habilita todo permiso.
 * - El role type "super_admin" también concede todo por defensa (si el
 *   backend alguna vez omitiera permissions en la sesión).
 * - Los permisos se aplanan sobre `roles[].permissions` (contrato real).
 *
 * Uso: ocultar/mostrar secciones del nav y acciones de UX por permiso.
 */
export function can(
  user: SessionUser | null | undefined,
  permission: string,
): boolean {
  if (!user) return false;

  const roles = user.roles ?? [];
  if (roles.some((role) => role.type === "super_admin")) return true;

  const permissions = roles.flatMap((role) => role.permissions ?? []);
  return permissions.includes("*") || permissions.includes(permission);
}

/**
 * Gate de permiso DENTRO de un taller concreto.
 *
 * `can()` solo lee roles de SISTEMA (`/auth/me.roles`), que un owner/mecánico
 * de taller no tiene (`roles: []`). Los permisos de taller viven en la
 * membresía (`workshopMemberships[].role.permissions`, poblados por
 * `GetSessionHandler` desde `workshop_role_permissions`).
 *
 * Reglas:
 * - `can(user, permission)` primero: super_admin y roles de plataforma
 *   conservan acceso (el backend los autoriza por bypass).
 * - Sin membresía activa para `workshopId` → false.
 * - Sesiones viejas sin `role.permissions` → false (fallback seguro: se
 *   oculta la acción, el backend sigue siendo la autoridad).
 *
 * NUNCA es security boundary (AGENTS.md §22).
 */
export function canInWorkshop(
  user: SessionUser | null | undefined,
  workshopId: string | null | undefined,
  permission: string,
): boolean {
  if (!user) return false;
  if (can(user, permission)) return true;
  if (!workshopId) return false;

  const membership = (user.workshopMemberships ?? []).find(
    (m) => m.workshopId === workshopId,
  );
  return membership?.role.permissions?.includes(permission) ?? false;
}

/**
 * Comprueba si el usuario tiene un role TYPE concreto (p. ej. "super_admin").
 * Util para reglas de UX que dependen del rol y no de un permiso puntual
 * (P1: desbloqueo del CUIT a super_admin en la edición admin).
 */
export function hasRole(
  user: SessionUser | null | undefined,
  roleType: string,
): boolean {
  if (!user) return false;
  return (user.roles ?? []).some((role) => role.type === roleType);
}