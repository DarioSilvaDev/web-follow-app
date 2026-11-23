"use client";

/**
 * Historial de membresías dadas de baja (inactivas) — detalle de usuario
 * (tabs Talleres / Concesionarias). Tabla de SOLO LECTURA:
 * org (link) | Rol | Desde | Baja | Estado ("Inactiva").
 *
 * `leftAt` puede faltar o venir null en casos viejos (sin sello): se muestra
 * "Sin sello" en vez de inventar una fecha.
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatAdminDate } from "@/lib/admin-status";
import type { MemberEntityType } from "./change-member-role-dialog";
import type {
  AdminUserDealershipMembership,
  AdminUserWorkshopMembership,
} from "@/types/admin";

type InactiveMembership =
  | AdminUserWorkshopMembership
  | AdminUserDealershipMembership;

function normalize(item: InactiveMembership) {
  if ("workshopId" in item) {
    return {
      href: `/admin/workshops/${item.workshopId}`,
      name: item.workshopName,
      roleName: item.roleName,
      joinedAt: item.joinedAt,
      leftAt: item.leftAt ?? null,
    };
  }
  return {
    href: `/admin/dealerships/${item.dealershipId}`,
    name: item.dealershipName,
    roleName: item.roleName,
    joinedAt: item.joinedAt,
    leftAt: item.leftAt ?? null,
  };
}

export function InactiveMembershipsTable({
  entityType,
  memberships,
}: {
  entityType: MemberEntityType;
  memberships: InactiveMembership[];
}) {
  if (memberships.length === 0) {
    return null;
  }

  const entityLabel = entityType === "dealership" ? "concesionaria" : "taller";

  return (
    <div className="mt-3 overflow-x-auto border-t border-border pt-3">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Historial de membresías inactivas
      </p>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Membresías de {entityLabel} dadas de baja
        </caption>
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">
              {entityType === "dealership" ? "Concesionaria" : "Taller"}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Rol
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Desde
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Baja
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Estado
            </th>
          </tr>
        </thead>
        <tbody>
          {memberships.map((membership) => {
            const row = normalize(membership);
            return (
              <tr
                key={membership.id}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={row.href}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="secondary">{row.roleName}</Badge>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {formatAdminDate(row.joinedAt)}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {row.leftAt ? formatAdminDate(row.leftAt) : "Sin sello"}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="secondary">Inactiva</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
