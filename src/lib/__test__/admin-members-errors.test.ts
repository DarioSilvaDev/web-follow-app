/**
 * Tests del mapeo de errores del panel superadmin — Usuarios 360 y membresías
 * (panel superadmin, contrato backend aditivo).
 *
 * Cubre:
 * - resolveAddMemberError: 403 (dealership → mensaje accionable pendiente de
 *   seed; workshop → permisos) / 404 (taller|usuario|rol) / 409 (ya miembro).
 * - resolveChangeMemberRoleError: 400 (rol de otra entidad) / 404 / 403.
 * - resolveRemoveMemberError: 404 / 403.
 * - resolveListEntityMembersError / resolveListEntityRolesError.
 * - resolveImpersonateUserError: 404 / 403 / 429.
 * - resolveDeleteUserError: 400 (propia cuenta / último super admin) / 403 / 404.
 *
 * El frontend NUNCA expone el mensaje crudo del backend; el 403 de
 * dealerships es accionable a propósito (permiso pendiente de seed).
 */
import { describe, it, expect } from "vitest";
import {
  resolveAddMemberError,
  resolveChangeMemberRoleError,
  resolveDeleteUserError,
  resolveImpersonateUserError,
  resolveListEntityMembersError,
  resolveListEntityRolesError,
  resolveRemoveMemberError,
} from "@/lib/admin-errors";

describe("resolveAddMemberError", () => {
  it("403 dealership → mensaje accionable del permiso pendiente de seed", () => {
    expect(resolveAddMemberError({ status: 403 }, "dealership")).toBe(
      "El backend aún no sincronizó el permiso admin.dealerships.members. Corré `npm run db:seed` en api-follow-app y reintentá.",
    );
  });

  it("403 workshop → sin permisos para talleres", () => {
    expect(resolveAddMemberError({ status: 403 }, "workshop")).toBe(
      "No tenés permisos para gestionar miembros de talleres.",
    );
  });

  it("404 → entidad/usuario/rol no encontrado", () => {
    expect(resolveAddMemberError({ status: 404 }, "workshop")).toContain(
      "encontró",
    );
    expect(resolveAddMemberError({ status: 404 }, "dealership")).toContain(
      "encontró",
    );
  });

  it("409 → ya es miembro; 400 → revisión; 5xx → genérico", () => {
    expect(resolveAddMemberError({ status: 409 }, "dealership")).toContain(
      "ya es miembro",
    );
    expect(resolveAddMemberError({ status: 400 }, "workshop")).toContain(
      "Revisá",
    );
    expect(resolveAddMemberError({ status: 500 }, "workshop")).toContain(
      "Error interno",
    );
  });
});

describe("resolveChangeMemberRoleError", () => {
  it("400 → rol de otra entidad; 404 → membresía inactiva/inexistente", () => {
    expect(resolveChangeMemberRoleError({ status: 400 }, "workshop")).toContain(
      "no pertenece",
    );
    expect(
      resolveChangeMemberRoleError({ status: 404 }, "dealership"),
    ).toContain("no existe o está inactiva");
  });

  it("403 dealership → mensaje del seed; 403 workshop → permisos", () => {
    expect(
      resolveChangeMemberRoleError({ status: 403 }, "dealership"),
    ).toContain("admin.dealerships.members");
    expect(
      resolveChangeMemberRoleError({ status: 403 }, "workshop"),
    ).toContain("permisos");
  });
});

describe("resolveRemoveMemberError", () => {
  it("404 → ya inactiva; 403 dealership → mensaje del seed", () => {
    expect(resolveRemoveMemberError({ status: 404 }, "workshop")).toContain(
      "ya está inactiva",
    );
    expect(resolveRemoveMemberError({ status: 403 }, "dealership")).toContain(
      "admin.dealerships.members",
    );
  });
});

describe("resolveListEntityMembersError / resolveListEntityRolesError", () => {
  it("dealership → mensaje del seed; workshop → mensaje propio", () => {
    expect(resolveListEntityMembersError("dealership")).toContain(
      "admin.dealerships.members",
    );
    expect(resolveListEntityMembersError("workshop")).toContain("miembros");
    expect(resolveListEntityRolesError("dealership")).toContain(
      "admin.dealerships.members",
    );
    expect(resolveListEntityRolesError("workshop")).toContain("roles");
  });
});

describe("resolveImpersonateUserError", () => {
  it("404 → objetivo inexistente o inactivo; 403 → permisos; 429 → rate limit", () => {
    expect(resolveImpersonateUserError({ status: 404 })).toContain(
      "no existe o no está activo",
    );
    expect(resolveImpersonateUserError({ status: 403 })).toContain(
      "permisos",
    );
    expect(resolveImpersonateUserError({ status: 429 })).toContain(
      "Demasiados intentos",
    );
    expect(resolveImpersonateUserError({ status: 500 })).toContain(
      "Error interno",
    );
  });
});

describe("resolveDeleteUserError", () => {
  it("400 → propia cuenta o último super admin", () => {
    expect(resolveDeleteUserError({ status: 400 })).toContain(
      "último super admin",
    );
  });

  it("403 / 404 / 5xx", () => {
    expect(resolveDeleteUserError({ status: 403 })).toContain("permisos");
    expect(resolveDeleteUserError({ status: 404 })).toContain("ya no existe");
    expect(resolveDeleteUserError({ status: 500 })).toContain("Error interno");
  });
});
