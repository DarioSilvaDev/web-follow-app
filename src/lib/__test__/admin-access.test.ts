/**
 * Tests de los gates de UX admin (hasAdminAccess + can).
 *
 * Contrato de sesión real (GET /auth/me → SessionUser):
 * - super_admin → permissions ["*"] (RoleDto includePermissions=true).
 * - roles[].permissions: string[]; un permiso puntual (p. ej.
 *   "admin.dealerships.list") puede estar en cualquier rol de tipo
 *   "admin"/"support".
 *
 * REGLA: estos helpers son gates de NAVEGACIÓN/UX, nunca una security
 * boundary (AGENTS.md §22) — el backend enforcea cada endpoint /admin.
 */
import { describe, expect, it } from "vitest";
import { can, canInWorkshop, hasAdminAccess } from "@/lib/admin-access";
import type { SessionUser } from "@/types/auth";

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "u1",
    email: "admin@hcdv.com",
    firstName: "Admin",
    lastName: "Plataforma",
    alias: null,
    avatarUrl: null,
    language: "es",
    status: "active",
    isVehicleOwner: false,
    roles: [],
    workshopMemberships: [],
    ...overrides,
  };
}

describe("hasAdminAccess (gate de workspace)", () => {
  it("null/undefined → false", () => {
    expect(hasAdminAccess(null)).toBe(false);
    expect(hasAdminAccess(undefined)).toBe(false);
  });

  it("super_admin → true (con o sin permissions)", () => {
    expect(
      hasAdminAccess(
        makeUser({ roles: [{ id: "r1", type: "super_admin", name: "Super Admin" }] }),
      ),
    ).toBe(true);
  });

  it("admin → true (el type admin es gate de workspace)", () => {
    expect(
      hasAdminAccess(
        makeUser({ roles: [{ id: "r1", type: "admin", name: "Admin" }] }),
      ),
    ).toBe(true);
  });

  it("permiso '*' → true (contrato super_admin includePermissions)", () => {
    expect(
      hasAdminAccess(
        makeUser({
          roles: [
            {
              id: "r1",
              type: "admin",
              name: "Admin",
              permissions: ["*", "admin.dashboard"],
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("admin.dashboard → true (entrada al workspace)", () => {
    expect(
      hasAdminAccess(
        makeUser({
          roles: [
            {
              id: "r1",
              type: "admin",
              name: "Admin",
              permissions: ["admin.dashboard"],
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("un permiso de sección SIN admin.dashboard NO concede el workspace", () => {
    expect(
      hasAdminAccess(
        makeUser({
          roles: [
            {
              id: "r1",
              type: "support",
              name: "Support",
              permissions: ["admin.dealerships.list"],
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("user común → false", () => {
    expect(
      hasAdminAccess(
        makeUser({ roles: [{ id: "r1", type: "user", name: "User" }] }),
      ),
    ).toBe(false);
  });
});

describe("can (gate de sección)", () => {
  it("null/undefined → false", () => {
    expect(can(null, "admin.dealerships.list")).toBe(false);
    expect(can(undefined, "admin.dealerships.list")).toBe(false);
  });

  it("super_admin → true para CUALQUIER permiso (defensivo, sin permissions)", () => {
    const superAdmin = makeUser({
      roles: [{ id: "r1", type: "super_admin", name: "Super Admin" }],
    });
    expect(can(superAdmin, "admin.dealerships.list")).toBe(true);
    expect(can(superAdmin, "admin.workshops.list")).toBe(true);
    expect(can(superAdmin, "future.section.list")).toBe(true);
  });

  it("wildcard '*' → true para cualquier permiso", () => {
    const wildcard = makeUser({
      roles: [
        {
          id: "r1",
          type: "admin",
          name: "Admin",
          permissions: ["*"],
        },
      ],
    });
    expect(can(wildcard, "admin.dealerships.list")).toBe(true);
    expect(can(wildcard, "admin.workshops.list")).toBe(true);
  });

  it("permiso exacto en roles[].permissions → true", () => {
    const admin = makeUser({
      roles: [
        {
          id: "r1",
          type: "admin",
          name: "Admin",
          permissions: ["admin.dealerships.list", "admin.dealerships.create"],
        },
      ],
    });
    expect(can(admin, "admin.dealerships.list")).toBe(true);
    expect(can(admin, "admin.dealerships.create")).toBe(true);
    expect(can(admin, "admin.workshops.list")).toBe(false);
  });

  it("permisos se aplanan a través de VÁRIOS roles", () => {
    const user = makeUser({
      roles: [
        {
          id: "r1",
          type: "support",
          name: "Soporte",
          permissions: ["admin.dealerships.list"],
        },
        {
          id: "r2",
          type: "admin",
          name: "Admin",
          permissions: ["admin.workshops.list"],
        },
      ],
    });
    expect(can(user, "admin.dealerships.list")).toBe(true);
    expect(can(user, "admin.workshops.list")).toBe(true);
    expect(can(user, "admin.dashboard")).toBe(false);
  });

  it("roles sin permissions → false (defensa: el tipo de rol no otorga por sí mismo)", () => {
    const adminWithoutPermissions = makeUser({
      roles: [{ id: "r1", type: "admin", name: "Admin" }],
    });
    expect(can(adminWithoutPermissions, "admin.dealerships.list")).toBe(false);
    expect(can(adminWithoutPermissions, "admin.dashboard")).toBe(false);
  });
});

describe("canInWorkshop (gate por taller)", () => {
  const membership = (
    workshopId: string,
    code: string,
    permissions?: string[],
  ) => ({
    workshopId,
    workshop: { id: workshopId, name: `Taller ${workshopId}` },
    role: { id: `role-${workshopId}`, code, name: code, permissions },
  });

  it("owner de taller sin roles de sistema → true con el permiso de la membresía", () => {
    const owner = makeUser({
      roles: [],
      workshopMemberships: [
        membership("ws-1", "owner", [
          "vehicle-claim.create",
          "vehicle-claim.list",
          "vehicle-claim.review",
          "vehicle-claim.revoke",
        ]),
      ],
    });

    expect(canInWorkshop(owner, "ws-1", "vehicle-claim.list")).toBe(true);
    expect(canInWorkshop(owner, "ws-1", "vehicle-claim.revoke")).toBe(true);
  });

  it("mecánico: create/list sí, review/revoke no (espejo del backend)", () => {
    const mechanic = makeUser({
      roles: [],
      workshopMemberships: [
        membership("ws-1", "mechanic", [
          "vehicle-claim.create",
          "vehicle-claim.list",
        ]),
      ],
    });

    expect(canInWorkshop(mechanic, "ws-1", "vehicle-claim.list")).toBe(true);
    expect(canInWorkshop(mechanic, "ws-1", "vehicle-claim.create")).toBe(true);
    expect(canInWorkshop(mechanic, "ws-1", "vehicle-claim.review")).toBe(false);
    expect(canInWorkshop(mechanic, "ws-1", "vehicle-claim.revoke")).toBe(false);
  });

  it("no mezcla talleres: el permiso de ws-1 no aplica en ws-2", () => {
    const owner = makeUser({
      roles: [],
      workshopMemberships: [
        membership("ws-1", "owner", ["vehicle-claim.list"]),
        membership("ws-2", "mechanic", ["vehicle-claim.list"]),
      ],
    });

    expect(canInWorkshop(owner, "ws-1", "vehicle-claim.revoke")).toBe(false);
    expect(canInWorkshop(owner, "ws-2", "vehicle-claim.list")).toBe(true);
    expect(canInWorkshop(owner, "ws-3", "vehicle-claim.list")).toBe(false);
  });

  it("super_admin conserva el bypass aunque no tenga membresía", () => {
    const superAdmin = makeUser({
      roles: [
        {
          id: "r1",
          type: "super_admin",
          name: "Super Admin",
          permissions: ["*"],
        },
      ],
    });

    expect(canInWorkshop(superAdmin, "ws-1", "vehicle-claim.list")).toBe(true);
    expect(canInWorkshop(superAdmin, null, "vehicle-claim.list")).toBe(true);
  });

  it("sesión vieja sin role.permissions → false (fallback seguro)", () => {
    const legacy = makeUser({
      roles: [],
      workshopMemberships: [membership("ws-1", "owner")],
    });

    expect(canInWorkshop(legacy, "ws-1", "vehicle-claim.list")).toBe(false);
  });

  it("null/undefined → false", () => {
    expect(canInWorkshop(null, "ws-1", "vehicle-claim.list")).toBe(false);
    expect(canInWorkshop(undefined, "ws-1", "vehicle-claim.list")).toBe(false);
    expect(canInWorkshop(makeUser(), null, "vehicle-claim.list")).toBe(false);
  });
});