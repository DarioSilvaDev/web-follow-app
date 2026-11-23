"use client";

/**
 * Sección "Concesionarias" del perfil 360 de un usuario (tab del detalle
 * /admin/users/[id]).
 *
 * ⚠️ Permiso pendiente de seed: `admin.dealerships.members` existe en el
 * seed del backend pero todavía no fue sincronizado en BD, así que los
 * endpoints de membresía de concesionaria responden 403 hasta que se corra
 * `npm run db:seed`. La UI:
 * - si el usuario NO tiene el permiso (can() === false): muestra la tabla de
 *   membresías (lectura, desde el payload del usuario) pero NO las acciones,
 *   y explica el porqué con un aviso accionable;
 * - si el backend 403 igual (sesión desincronizada): el copy del error es
 *   accionable ("corré el seed"), nunca un mensaje crudo del backend.
 */
import { useState } from "react";
import Link from "next/link";
import { Info, Store } from "lucide-react";
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
import type { AdminUserDealershipMembership } from "@/types/admin";

export interface UserDealershipsSectionProps {
  memberships: AdminUserDealershipMembership[];
  /** Historial de membresías dadas de baja (opcional; default []). */
  inactiveMemberships?: AdminUserDealershipMembership[];
  userId: string;
  userEmail: string;
  /** Nombre a mostrar del usuario (para aria-labels de acciones). */
  displayName: string;
}

export function UserDealershipsSection({
  memberships,
  inactiveMemberships = [],
  userId,
  userEmail,
  displayName,
}: UserDealershipsSectionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can(user, "admin.dealerships.members");
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
    entityId: membership.dealershipId,
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
        <CardTitle className="text-base">Concesionarias</CardTitle>
        {canManage && memberships.length > 0 && (
          <AssignMemberDialog
            entityType="dealership"
            lockedEmail={userEmail}
            onAssigned={handleAssigned}
            triggerLabel="Asignar a concesionaria"
            inactiveMemberships={inactiveSummaries}
          />
        )}
      </CardHeader>
      <CardContent
        className={memberships.length === 0 ? undefined : "overflow-x-auto"}
      >
        {!canManage && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p>
              Las acciones sobre concesionarias requieren el permiso{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                admin.dealerships.members
              </code>
              , que el backend aún no sincronizó. Corré{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                npm run db:seed
              </code>{" "}
              en api-follow-app para habilitarlas. La tabla es de solo lectura
              mientras tanto.
            </p>
          </div>
        )}

        {reactivationMessage && (
          <Callout variant="success" role="status" className="mb-3">
            {reactivationMessage}
          </Callout>
        )}

        {memberships.length === 0 ? (
          <EmptyState
            icon={Store}
            compact
            title="Este usuario no pertenece a ninguna concesionaria"
            description="Asignalo a una concesionaria existente para que pueda operar como miembro."
            action={
              canManage ? (
                <AssignMemberDialog
                  entityType="dealership"
                  lockedEmail={userEmail}
                  onAssigned={handleAssigned}
                  triggerLabel="Asignar a concesionaria"
                  inactiveMemberships={inactiveSummaries}
                />
              ) : undefined
            }
          />
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Concesionarias a las que pertenece {displayName}
            </caption>
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">
                  Concesionaria
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
                      href={`/admin/dealerships/${membership.dealershipId}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {membership.dealershipName}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {membership.dealershipStatus !== "active" && (
                        <span className="text-xs text-muted-foreground">
                          Pendiente de claim
                        </span>
                      )}
                      {!membership.dealershipIsActive && (
                        <Badge variant="outline" className="text-destructive">
                          Deshabilitada
                        </Badge>
                      )}
                    </span>
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
                          entityType="dealership"
                          entityId={membership.dealershipId}
                          memberId={membership.id}
                          memberName={displayName}
                          currentRoleId={membership.roleId}
                          onChanged={invalidateUser}
                        />
                        <RemoveMemberDialog
                          entityType="dealership"
                          entityId={membership.dealershipId}
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
                entityType="dealership"
                memberships={inactiveMemberships}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
