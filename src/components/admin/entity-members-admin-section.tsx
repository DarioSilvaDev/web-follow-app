"use client";

/**
 * Sección "Miembros" administrada para las fichas admin de taller y
 * concesionaria.
 *
 * - Sin permiso `admin.{workshops|dealerships}.members`: renderiza la tabla
 *   de SOLO LECTURA con los miembros embebidos en el detalle (comportamiento
 *   previo), porque el endpoint de miembros exige el permiso y fallaría.
 * - Con permiso: consume GET /admin/{workshops|dealerships}/:id/members
 *   (incluye inactivas — la UI las distingue por status y las oculta por
 *   defecto detrás de un toggle), con acciones de asignar / cambiar rol /
 *   quitar (baja suave).
 *
 * Para concesionarias el permiso existe en el seed pero puede no estar
 * sincronizado en BD (aún no se corrió `npm run db:seed`): can() lo ve como
 * ausente → cae al fallback de solo lectura + aviso accionable.
 */
import { useState } from "react";
import { UserRound, UsersRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AssignMemberDialog } from "@/components/admin/assign-member-dialog";
import { ChangeMemberRoleDialog } from "@/components/admin/change-member-role-dialog";
import { MembershipStatusBadge } from "@/components/admin/membership-status-badge";
import { RemoveMemberDialog } from "@/components/admin/remove-member-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Info } from "lucide-react";
import { adminApi } from "@/lib/api";
import { resolveListEntityMembersError } from "@/lib/admin-errors";
import { formatAdminDate } from "@/lib/admin-status";
import { Callout } from "@/components/ui/callout";
import type { MemberEntityType } from "@/components/admin/change-member-role-dialog";
import type { AssignMemberResult } from "@/components/admin/assign-member-dialog";
import type { AdminMemberItem } from "@/types/admin";

export interface FallbackMember {
  id: string;
  userName: string;
  userEmail: string;
  roleName: string;
  status: string;
  joinedAt: string;
}

export interface EntityMembersAdminSectionProps {
  entityType: MemberEntityType;
  entityId: string;
  entityName: string;
  canManage: boolean;
  /** Miembros embebidos en el detalle (fallback de solo lectura). */
  fallbackMembers: FallbackMember[];
}

export function EntityMembersAdminSection({
  entityType,
  entityId,
  entityName,
  canManage,
  fallbackMembers,
}: EntityMembersAdminSectionProps) {
  const [showInactive, setShowInactive] = useState(false);
  const [reactivationNotice, setReactivationNotice] = useState(false);

  const membersQuery = useQuery({
    queryKey: ["admin-entity-members", entityType, entityId],
    queryFn: () =>
      entityType === "workshop"
        ? adminApi.listWorkshopMembers(entityId)
        : adminApi.listDealershipMembers(entityId),
    enabled: canManage,
    retry: false,
  });

  const entityNoun = entityType === "dealership" ? "concesionaria" : "taller";

  const handleAssigned = (result: AssignMemberResult) => {
    setReactivationNotice(result.reactivated);
    membersQuery.refetch();
  };

  if (!canManage) {
    const visible = fallbackMembers.filter((m) => m.status !== "inactive");
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Miembros</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {entityType === "dealership" && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-foreground">
              <Info
                className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                aria-hidden="true"
              />
              <p>
                Gestión de miembros deshabilitada: falta el permiso{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  admin.dealerships.members
                </code>
                . Corré{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  npm run db:seed
                </code>{" "}
                en api-follow-app para habilitarla.
              </p>
            </div>
          )}
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin miembros activos todavía. La {entityNoun} se activa cuando el
              dueño completa el alta desde la invitación.
            </p>
          ) : (
            <ReadOnlyTable members={visible} />
          )}
        </CardContent>
      </Card>
    );
  }

  const allMembers: AdminMemberItem[] = membersQuery.data ?? [];
  const activeMembers = allMembers.filter((m) => m.status !== "inactive");
  const hiddenInactive = allMembers.length - activeMembers.length;
  const visibleMembers = showInactive ? allMembers : activeMembers;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">
          Miembros{" "}
          <span className="font-normal text-muted-foreground">
            ({activeMembers.length})
          </span>
        </CardTitle>
        <AssignMemberDialog
          entityType={entityType}
          lockedEntity={{ id: entityId, name: entityName }}
          onAssigned={handleAssigned}
        />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {reactivationNotice && (
          <Callout variant="success" role="status" className="mb-3">
            Membresía reactivada. El acceso es efectivo de inmediato.
          </Callout>
        )}
        {membersQuery.isLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-lg border bg-muted/50"
              />
            ))}
          </div>
        ) : membersQuery.isError ? (
          <EmptyState
            icon={UsersRound}
            compact
            title="No se pudieron cargar los miembros"
            description={resolveListEntityMembersError(entityType)}
          />
        ) : visibleMembers.length === 0 ? (
          <EmptyState
            icon={UserRound}
            compact
            title="Todavía no hay miembros"
            description={`Asigná el primer miembro a esta ${entityNoun}. El email debe pertenecer a un usuario registrado.`}
          />
        ) : (
          <>
            {hiddenInactive > 0 && (
              <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(event) => setShowInactive(event.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Mostrar inactivas ({hiddenInactive})
              </label>
            )}
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Miembros de la {entityNoun}</caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Nombre
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Rol
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Estado
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Desde
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleMembers.map((member) => {
                  const isInactive = member.status === "inactive";
                  return (
                    <tr
                      key={member.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-3 py-2.5">
                        <span className="block font-medium text-foreground">
                          {member.userName}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {member.userEmail}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="secondary">{member.roleName}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <MembershipStatusBadge status={member.status} />
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {formatAdminDate(member.joinedAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {!isInactive && (
                            <>
                              <ChangeMemberRoleDialog
                                entityType={entityType}
                                entityId={entityId}
                                memberId={member.id}
                                memberName={member.userName}
                                currentRoleId={member.roleId}
                              />
                              <RemoveMemberDialog
                                entityType={entityType}
                                entityId={entityId}
                                memberId={member.id}
                                memberName={member.userName}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReadOnlyTable({ members }: { members: FallbackMember[] }) {
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">Miembros</caption>
      <thead>
        <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
          <th scope="col" className="px-3 py-2 font-medium">
            Nombre
          </th>
          <th scope="col" className="px-3 py-2 font-medium">
            Email
          </th>
          <th scope="col" className="px-3 py-2 font-medium">
            Rol
          </th>
          <th scope="col" className="px-3 py-2 font-medium">
            Estado
          </th>
          <th scope="col" className="px-3 py-2 font-medium">
            Desde
          </th>
        </tr>
      </thead>
      <tbody>
        {members.map((member) => (
          <tr
            key={member.id}
            className="border-b border-border last:border-b-0"
          >
            <td className="px-3 py-2.5 font-medium text-foreground">
              {member.userName}
            </td>
            <td className="px-3 py-2.5 text-muted-foreground">
              {member.userEmail}
            </td>
            <td className="px-3 py-2.5">
              <Badge variant="secondary">{member.roleName}</Badge>
            </td>
            <td className="px-3 py-2.5">
              <MembershipStatusBadge status={member.status} />
            </td>
            <td className="px-3 py-2.5 text-muted-foreground">
              {formatAdminDate(member.joinedAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
