"use client";

/**
 * Sección "Talleres" del perfil 360 de un usuario (tab del detalle
 * /admin/users/[id]).
 *
 * Fuente: `workshopMemberships` vigentes embebidas en GET /admin/users/:id
 * (NO inactivas) + `inactiveWorkshopMemberships` (historial, baja suave).
 * Las inactivas se listan aparte bajo un toggle, ocultas por default.
 *
 * Acciones de membresía (alta/cambio de rol/baja) requieren
 * `admin.workshops.members` (backend; la UI solo oculta — nunca es boundary).
 * Si el backend reactiva una membresía inactive previa, la respuesta trae
 * `reactivated: true` y la página muestra un banner inline.
 */
import { useState } from "react";
import Link from "next/link";
import { Wrench } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AssignMemberDialog } from "@/components/admin/assign-member-dialog";
import type { AssignMemberResult } from "@/components/admin/assign-member-dialog";
import { ChangeMemberRoleDialog } from "@/components/admin/change-member-role-dialog";
import { MembershipStatusBadge } from "@/components/admin/membership-status-badge";
import { InactiveMembershipsTable } from "@/components/admin/inactive-memberships-table";
import { RemoveMemberDialog } from "@/components/admin/remove-member-dialog";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/admin-access";
import { formatAdminDate } from "@/lib/admin-status";
import type { AdminUserWorkshopMembership } from "@/types/admin";

export interface UserWorkshopsSectionProps {
  memberships: AdminUserWorkshopMembership[];
  /** Historial de membresías dadas de baja (opcional; default []). */
  inactiveMemberships?: AdminUserWorkshopMembership[];
  userId: string;
  userEmail: string;
  /** Nombre a mostrar del usuario (para aria-labels de acciones). */
  displayName: string;
}

export function UserWorkshopsSection({
  memberships,
  inactiveMemberships = [],
  userId,
  userEmail,
  displayName,
}: UserWorkshopsSectionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can(user, "admin.workshops.members");
  const [showInactive, setShowInactive] = useState(false);
  const [reactivationNotice, setReactivationNotice] = useState<{
    leftAt: string | null;
  } | null>(null);

  const invalidateUser = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const handleAssigned = (result: AssignMemberResult) => {
    invalidateUser();
    setReactivationNotice(
      result.reactivated ? { leftAt: result.previousLeftAt } : null,
    );
  };

  const inactiveSummaries = inactiveMemberships.map((membership) => ({
    entityId: membership.workshopId,
    joinedAt: membership.joinedAt,
    leftAt: membership.leftAt ?? null,
  }));

  const reactivationMessage = reactivationNotice
    ? reactivationNotice.leftAt
      ? `Membresía reactivada (antes inactiva desde ${formatAdminDate(reactivationNotice.leftAt)}). El acceso es efectivo de inmediato.`
      : "Membresía reactivada. El acceso es efectivo de inmediato."
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">Talleres</CardTitle>
        {canManage && memberships.length > 0 && (
          <AssignMemberDialog
            entityType="workshop"
            lockedEmail={userEmail}
            onAssigned={handleAssigned}
            triggerLabel="Asignar a taller"
            inactiveMemberships={inactiveSummaries}
          />
        )}
      </CardHeader>
      <CardContent className={memberships.length === 0 ? undefined : "overflow-x-auto"}>
        {reactivationMessage && (
          <Callout variant="success" role="status" className="mb-3">
            {reactivationMessage}
          </Callout>
        )}

        {memberships.length === 0 ? (
          <EmptyState
            icon={Wrench}
            compact
            title="Este usuario no pertenece a ningún taller"
            description="Asignalo a un taller existente para que pueda operar como miembro."
            action={
              canManage ? (
                <AssignMemberDialog
                  entityType="workshop"
                  lockedEmail={userEmail}
                  onAssigned={handleAssigned}
                  triggerLabel="Asignar a taller"
                  inactiveMemberships={inactiveSummaries}
                />
              ) : undefined
            }
          />
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Talleres a los que pertenece {displayName}
            </caption>
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">
                  Taller
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Sucursal
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Rol
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Desde
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Estado
                </th>
                {canManage && (
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {memberships.map((membership) => (
                <tr
                  key={membership.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/workshops/${membership.workshopId}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {membership.workshopName}
                    </Link>
                    {membership.workshopStatus !== "active" && (
                      <span className="block text-xs text-muted-foreground">
                        Pendiente de claim
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {membership.defaultBranchName ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="secondary">{membership.roleName}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {formatAdminDate(membership.joinedAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <MembershipStatusBadge status={membership.status} />
                  </td>
                  {canManage && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <ChangeMemberRoleDialog
                          entityType="workshop"
                          entityId={membership.workshopId}
                          memberId={membership.id}
                          memberName={displayName}
                          currentRoleId={membership.roleId}
                          onChanged={invalidateUser}
                        />
                        <RemoveMemberDialog
                          entityType="workshop"
                          entityId={membership.workshopId}
                          memberId={membership.id}
                          memberName={displayName}
                          onRemoved={invalidateUser}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {inactiveMemberships.length > 0 && (
          <>
            <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Mostrar inactivas ({inactiveMemberships.length})
            </label>
            {showInactive && (
              <InactiveMembershipsTable
                entityType="workshop"
                memberships={inactiveMemberships}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
