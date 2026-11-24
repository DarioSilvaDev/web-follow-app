"use client";

/**
 * Botón + diálogo "Quitar miembro" de una membresía (taller o concesionaria).
 *
 * Baja suave: el backend setea status=inactive + leftAt (la membresía sale del
 * ecosistema operativo pero se conserva el historial). Confirma con Dialog
 * destructive; el texto aclara el efecto.
 */
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { adminApi } from "@/lib/api";
import { resolveRemoveMemberError } from "@/lib/admin-errors";
import type { MemberEntityType } from "./change-member-role-dialog";

export interface RemoveMemberDialogProps {
  entityType: MemberEntityType;
  entityId: string;
  memberId: string;
  memberName: string;
  /** Se llama tras una baja exitosa (para invalidar queries del consumidor). */
  onRemoved?: () => void;
}

export function RemoveMemberDialog({
  entityType,
  entityId,
  memberId,
  memberName,
  onRemoved,
}: RemoveMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: () =>
      entityType === "workshop"
        ? adminApi.removeWorkshopMember(entityId, memberId)
        : adminApi.removeDealershipMember(entityId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-entity-members", entityType, entityId],
      });
      setDialogError(null);
      setOpen(false);
      onRemoved?.();
    },
    onError: (error) => {
      setDialogError(resolveRemoveMemberError(error, entityType));
    },
  });

  const entityLabel =
    entityType === "dealership" ? "la concesionaria" : "el taller";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDialogError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Quitar a ${memberName}`}
          />
        }
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </DialogTrigger>
      <DialogPopup>
        <DialogTitle>¿Quitar a {memberName}?</DialogTitle>
        <DialogDescription>
          La membresía queda inactiva y la persona deja de operar en {entityLabel}
          . El historial se conserva; podés volver a asignarla más tarde.
        </DialogDescription>

        {dialogError && (
          <Callout variant="destructive" role="alert" className="mt-3">
            {dialogError}
          </Callout>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <DialogClose render={<Button variant="outline" />}>
            Cancelar
          </DialogClose>
          <Button
            variant="destructive"
            disabled={removeMutation.isPending}
            onClick={() => removeMutation.mutate()}
          >
            {removeMutation.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            Quitar de {entityLabel}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
