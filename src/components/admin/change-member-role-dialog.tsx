"use client";

/**
 * Botón + diálogo "Cambiar rol" de una membresía (taller o concesionaria).
 *
 * Reutilizado por el detalle de usuario (tabs Talleres/Concesionarias) y por
 * las fichas admin de taller/concesionaria. Los roles se cargan bajo demanda
 * al abrir el diálogo (GET /admin/{workshops|dealerships}/:id/roles); el rol
 * actual viene del consumidor como `currentRoleId`.
 *
 * Errores: resolveChangeMemberRoleError (403 con copy accionable para
 * concesionarias — permiso `admin.dealerships.members` pendiente de seed).
 */
import { useState } from "react";
import { Loader2, PencilLine } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { adminApi } from "@/lib/api";
import {
  resolveChangeMemberRoleError,
  resolveListEntityRolesError,
} from "@/lib/admin-errors";

export type MemberEntityType = "workshop" | "dealership";

export interface ChangeMemberRoleDialogProps {
  entityType: MemberEntityType;
  entityId: string;
  memberId: string;
  memberName: string;
  currentRoleId: string;
  /** Se llama tras un cambio exitoso (para invalidar queries del consumidor). */
  onChanged?: () => void;
}

const ENTITY_LABEL: Record<MemberEntityType, string> = {
  workshop: "taller",
  dealership: "concesionaria",
};

export function ChangeMemberRoleDialog({
  entityType,
  entityId,
  memberId,
  memberName,
  currentRoleId,
  onChanged,
}: ChangeMemberRoleDialogProps) {
  const [open, setOpen] = useState(false);
  const [roleId, setRoleId] = useState(currentRoleId);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const entityNoun = ENTITY_LABEL[entityType];

  const rolesQuery = useQuery({
    queryKey: ["admin-entity-roles", entityType, entityId],
    queryFn: () =>
      entityType === "workshop"
        ? adminApi.listWorkshopRoles(entityId)
        : adminApi.listDealershipRoles(entityId),
    enabled: open,
    retry: false,
    staleTime: 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["admin-entity-members", entityType, entityId],
    });
    // El consumidor invalida sus propias queries (["admin-user"], etc.)
    // en onChanged para no acoplar este diálogo a ellas.
    onChanged?.();
  };

  const changeMutation = useMutation({
    mutationFn: (nextRoleId: string) =>
      entityType === "workshop"
        ? adminApi.updateWorkshopMemberRole(entityId, memberId, nextRoleId)
        : adminApi.updateDealershipMemberRole(entityId, memberId, nextRoleId),
    onSuccess: () => {
      invalidate();
      setDialogError(null);
      setOpen(false);
    },
    onError: (error) => {
      setDialogError(resolveChangeMemberRoleError(error, entityType));
    },
  });

  const roles = rolesQuery.data ?? [];
  const unchanged = roleId === currentRoleId;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setRoleId(currentRoleId);
          setDialogError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Cambiar rol de ${memberName}`}
          />
        }
      >
        <PencilLine className="h-3.5 w-3.5" />
        Rol
      </DialogTrigger>
      <DialogPopup>
        <DialogTitle>Cambiar rol en {entityNoun}</DialogTitle>
        <DialogDescription>
          Vas a cambiar el rol de {memberName}. El cambio aplica de inmediato.
        </DialogDescription>

        {dialogError && (
          <Callout variant="destructive" role="alert" className="mt-3">
            {dialogError}
          </Callout>
        )}

        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor={`change-role-${memberId}`}>Rol</Label>
          {rolesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Cargando roles…
            </p>
          ) : rolesQuery.isError ? (
            <Callout variant="destructive" role="alert">
              {resolveListEntityRolesError(entityType)}
            </Callout>
          ) : (
            <Select
              id={`change-role-${memberId}`}
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <DialogClose render={<Button variant="outline" />}>
            Cancelar
          </DialogClose>
          <Button
            disabled={
              unchanged || !roleId || changeMutation.isPending || rolesQuery.isLoading
            }
            onClick={() => changeMutation.mutate(roleId)}
          >
            {changeMutation.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            Guardar rol
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
