"use client";

/**
 * Diálogo de alta DIRECTA de miembro (taller o concesionaria) desde el panel
 * admin — sin invitación por email; el email debe pertenecer a un usuario
 * YA REGISTRADO (el backend responde 404 si no existe).
 *
 * Dos modos:
 * - Desde el detalle de usuario (`lockedEmail`): email precargado y readonly;
 *   el admin busca el taller/concesionaria por nombre/CUIT (q, mín 2 chars) y
 *   elige el rol de la entidad seleccionada.
 * - Desde el detalle de la entidad (`lockedEntity`): entidad fija; el email es
 *   editable; solo se elige rol + email.
 *
 * Permiso de backend: admin.workshops.members / admin.dealerships.members
 * (el 403 de concesionarias es accionable — permiso pendiente de seed).
 */
import { useState } from "react";
import { Check, History, Loader2, Search, Store, Wrench, UserRound } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Dialog,
  DialogDescription,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "cn";
import { useDebounce } from "@/hooks/use-debounce";
import { adminApi } from "@/lib/api";
import {
  resolveAddMemberError,
  resolveListEntityRolesError,
} from "@/lib/admin-errors";
import { formatAdminDate } from "@/lib/admin-status";
import type { MemberEntityType } from "./change-member-role-dialog";

/** Historial de una membresía dada de baja, según la org elegida en el buscador. */
export interface InactiveMembershipSummary {
  /** id de la entidad (workshopId | dealershipId). */
  entityId: string;
  joinedAt: string;
  /** Fecha de baja (null en casos viejos sin sello). */
  leftAt: string | null;
}

/** Resultado informado al consumidor tras una asignación/reactivación exitosa. */
export interface AssignMemberResult {
  /** true si el backend reactivó una membresía inactive previa. */
  reactivated: boolean;
  /** leftAt previo usado para el mensaje (null si no aplica o no había sello). */
  previousLeftAt: string | null;
}

export interface AssignMemberDialogProps {
  entityType: MemberEntityType;
  /** Entidad fija (modo "desde el detalle de la entidad"). */
  lockedEntity?: { id: string; name: string };
  /** Email precargado y readonly (modo "desde el detalle de usuario"). */
  lockedEmail?: string;
  /** Se llama tras una asignación exitosa (para invalidar queries del consumidor). */
  onAssigned?: (result: AssignMemberResult) => void;
  /** Texto del botón disparador. Default: "Asignar a taller"/"Asignar a concesionaria". */
  triggerLabel?: string;
  /**
   * Historial de membresías dadas de baja del usuario (detalle de usuario).
   * Al elegir una org con historial inactivo se muestra un aviso amber y el
   * CTA pasa a "Reactivar membresía". Sin historial: comportamiento idéntico.
   */
  inactiveMemberships?: InactiveMembershipSummary[];
}

const ENTITY_COPY: Record<
  MemberEntityType,
  { noun: string; plural: string; action: string }
> = {
  workshop: { noun: "taller", plural: "talleres", action: "Asignar a taller" },
  dealership: {
    noun: "concesionaria",
    plural: "concesionarias",
    action: "Asignar a concesionaria",
  },
};

export function AssignMemberDialog({
  entityType,
  lockedEntity,
  lockedEmail,
  onAssigned,
  triggerLabel,
  inactiveMemberships,
}: AssignMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(
    lockedEntity ?? null,
  );
  const [email, setEmail] = useState(lockedEmail ?? "");
  const [roleId, setRoleId] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(search, 300);

  const copy = ENTITY_COPY[entityType];
  const entityId = lockedEntity?.id ?? chosen?.id ?? null;
  const entityName = lockedEntity?.name ?? chosen?.name ?? null;
  const trimmedEmail = email.trim().toLowerCase();
  const emailLocked = Boolean(lockedEmail);

  // Historial inactivo para la org elegida (reactivación vs alta nueva).
  const matchedInactive = entityId
    ? (inactiveMemberships?.find((m) => m.entityId === entityId) ?? null)
    : null;

  // Reset al cerrar: email vuelve al prefijado, búsqueda limpia.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSearch("");
      setChosen(lockedEntity ?? null);
      setEmail(lockedEmail ?? "");
      setRoleId("");
      setDialogError(null);
    }
  };

  const searchEnabled =
    open && !lockedEntity && debouncedSearch.trim().length >= 2;

  const resultsQuery = useQuery({
    queryKey: ["admin-entity-search", entityType, debouncedSearch.trim()],
    queryFn: async (): Promise<
      { id: string; name: string; taxId: string | null }[]
    > => {
      const res =
        entityType === "workshop"
          ? await adminApi.listWorkshops({
              page: 1,
              limit: 5,
              q: debouncedSearch.trim(),
            })
          : await adminApi.listDealerships({
              page: 1,
              limit: 5,
              q: debouncedSearch.trim(),
            });
      return res.data.map((item) => ({
        id: item.id,
        name: item.name,
        taxId: item.taxId ?? null,
      }));
    },
    enabled: searchEnabled,
    retry: false,
    staleTime: 30_000,
  });

  const rolesQuery = useQuery({
    queryKey: ["admin-entity-roles", entityType, entityId],
    queryFn: () =>
      entityType === "workshop"
        ? adminApi.listWorkshopRoles(entityId as string)
        : adminApi.listDealershipRoles(entityId as string),
    enabled: open && Boolean(entityId),
    retry: false,
    staleTime: 60_000,
  });

  const assignMutation = useMutation({
    mutationFn: () => {
      const input = { email: trimmedEmail, roleId };
      return entityType === "workshop"
        ? adminApi.addWorkshopMember(entityId as string, input)
        : adminApi.addDealershipMember(entityId as string, input);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["admin-entity-members", entityType, entityId],
      });
      setDialogError(null);
      const reactivated = data?.reactivated === true;
      const previousLeftAt = reactivated
        ? (matchedInactive?.leftAt ?? null)
        : null;
      handleOpenChange(false);
      onAssigned?.({ reactivated, previousLeftAt });
    },
    onError: (error) => {
      setDialogError(resolveAddMemberError(error, entityType));
    },
  });

  const results = resultsQuery.data ?? [];
  const canSubmit =
    Boolean(entityId) &&
    Boolean(roleId) &&
    trimmedEmail.length > 0 &&
    !assignMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="gap-1.5" />}
      >
        {entityType === "workshop" ? (
          <Wrench className="h-3.5 w-3.5" />
        ) : (
          <Store className="h-3.5 w-3.5" />
        )}
        {triggerLabel ?? copy.action}
      </DialogTrigger>
      <DialogPopup>
        <DialogTitle>{copy.action}</DialogTitle>
        <DialogDescription>
          Alta directa (sin invitación): la persona debe tener cuenta
          registrada con ese email.
        </DialogDescription>

        {dialogError && (
          <Callout variant="destructive" role="alert" className="mt-3">
            {dialogError}
          </Callout>
        )}

        {/* Paso 1: elegir entidad (solo cuando no está fija) */}
        {!lockedEntity && (
          <div className="mt-4 flex flex-col gap-1.5">
            <Label htmlFor="assign-member-search">
              Buscar {copy.noun}
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="assign-member-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nombre, razón social o CUIT"
                className="pl-10"
                autoComplete="off"
              />
            </div>

            {searchEnabled && (
              <div
                className="mt-1 overflow-hidden rounded-lg border"
                aria-label={`Resultados de búsqueda de ${copy.plural}`}
              >
                {resultsQuery.isLoading ? (
                  <p className="px-3 py-2.5 text-sm text-muted-foreground">
                    Buscando…
                  </p>
                ) : results.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Search}
                    title={`Sin resultados para “${debouncedSearch.trim()}”`}
                    description={`Ningún ${copy.noun} coincide. Probá con otro nombre o CUIT.`}
                  />
                ) : (
                  <ul className="divide-y">
                    {results.map((item) => {
                      const isChosen = chosen?.id === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setChosen({ id: item.id, name: item.name });
                              setRoleId("");
                              setDialogError(null);
                            }}
                            aria-pressed={isChosen}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                              isChosen && "bg-primary/5",
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">
                                {item.name}
                              </span>
                              {item.taxId && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  CUIT {item.taxId}
                                </span>
                              )}
                            </span>
                            {isChosen && (
                              <Check className="h-4 w-4 shrink-0 text-primary" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {entityId && (
              <p className="mt-1 text-xs text-muted-foreground">
                {copy.noun[0].toUpperCase() + copy.noun.slice(1)} elegido:{" "}
                <span className="font-medium text-foreground">
                  {entityName}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Historial inactivo para la org elegida → reactivación (amber) */}
        {matchedInactive && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/60 bg-warning/10 px-3 py-2 text-sm text-foreground">
            <History
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-warning"
            />
            <p>
              Este usuario fue miembro de{" "}
              <span className="font-medium">{entityName}</span> desde{" "}
              {formatAdminDate(matchedInactive.joinedAt)} hasta{" "}
              {matchedInactive.leftAt
                ? formatAdminDate(matchedInactive.leftAt)
                : "una baja sin sello de fecha"}
              .{" "}
              <span className="font-medium">
                Se reactivará la membresía con el rol que elijas.
              </span>
            </p>
          </div>
        )}

        {/* Email (precargado y readonly en modo detalle de usuario) */}
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="assign-member-email">Email del usuario</Label>
          <div className="relative">
            <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="assign-member-email"
              type="email"
              value={email}
              readOnly={emailLocked}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="usuario@ejemplo.com"
              className={cn("pl-10", emailLocked && "bg-muted/50")}
              autoComplete="off"
            />
          </div>
          {emailLocked && (
            <p className="text-xs text-muted-foreground">
              Precargado con el email del usuario de esta ficha.
            </p>
          )}
        </div>

        {/* Paso 2: rol en la entidad elegida */}
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="assign-member-role">Rol</Label>
          {!entityId ? (
            <p className="text-sm text-muted-foreground">
              Elegí un {copy.noun} para ver sus roles.
            </p>
          ) : rolesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando roles…</p>
          ) : rolesQuery.isError ? (
            <Callout variant="destructive" role="alert">
              {resolveListEntityRolesError(entityType)}
            </Callout>
          ) : (rolesQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este {copy.noun} no tiene roles configurados.
            </p>
          ) : (
            <Select
              id="assign-member-role"
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
            >
              <option value="" disabled>
                Elegí un rol…
              </option>
              {(rolesQuery.data ?? []).map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!canSubmit} onClick={() => assignMutation.mutate()}>
            {assignMutation.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            {matchedInactive ? "Reactivar membresía" : "Asignar"}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
