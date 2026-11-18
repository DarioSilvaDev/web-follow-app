"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RotateCw,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import { careEpisodeApi } from "@/lib/api";
import { formatDateOnly } from "@/lib/format-date";
import { vehicleKeys } from "@/lib/query-keys";
import type { CareEpisodeVerificationItem } from "@/types/care-episode";

// ---------------------------------------------------------------------------
// Iteración 2-2 / RF-8 — "Verificaciones" (taller, contexto WORKSHOP).
// Journey: el taller ve la cola de episodios `source='owner'` + `unverified`
// de SU taller (GET /care-episodes/verifications, RF-4), confirma el trabajo
// (POST /care-episodes/:id/verify, RF-5) o lo RECHAZA (POST
// /care-episodes/:id/reject, diseño aprobado de rechazo de verificación) y
// puede entrar al detalle de la atención (`/vehicles/:id/servicios/:id`,
// `vehicleId` viene en la cola).
//
// WORKSHOP-only: sin taller seleccionado la página solo orienta (el backend
// responde 403 en PERSONAL — WorkshopOnly).
//
// La confirmación y el rechazo son destructivos y auditados (quedan en la
// historia del vehículo), así que se hacen con un diálogo del design system
// en lugar de `window.confirm` (consistente en todas las plataformas,
// accesible y estilado). El rechazo admite un motivo opcional (≤500).
// ---------------------------------------------------------------------------

function vehicleSummary(item: CareEpisodeVerificationItem): string {
  // MVP sin versiones: marca + modelo (la `version` legacy no se muestra).
  const catalog = [item.vehicle.brand, item.vehicle.model]
    .filter(Boolean)
    .join(" ");
  const year = item.vehicle.manufactureYear ?? null;
  return [catalog, year].filter(Boolean).join(" · ") || "Sin datos de catálogo";
}

/** Estado transicional del item: pending → verified | rejected → error (mensaje). */
type ItemState =
  | { status: "pending" }
  | { status: "verified" }
  | { status: "rejected" }
  | { status: "error"; message: string };

export default function VerificationsPage() {
  const activeContext = useActiveContext();
  const workshopId =
    activeContext?.type === "WORKSHOP" ? activeContext.workshopId : null;
  const { status, user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const workshopName = user?.workshopMemberships.find(
    (membership) => membership.workshopId === workshopId,
  )?.workshop.name;

  const hasWorkshopMembership =
    (user?.workshopMemberships?.length ?? 0) > 0;

  // Guard de membresía (PO): sin taller no hay journey de atenciones →
  // redirect a /dashboard. UX únicamente — el backend ya enforcea (403
  // WorkshopOnly). Durante `loading` NO se redirige (evita un falso
  // redirect en el bootstrap de la sesión).
  useEffect(() => {
    if (status !== "loading" && !hasWorkshopMembership) {
      router.replace("/dashboard");
    }
  }, [status, hasWorkshopMembership, router]);

  // ── Cola de verificaciones (RF-4: source=owner + unverified + ctx) ───────
  const itemsQuery = useQuery({
    queryKey: ["care-episode-verifications", workshopId],
    queryFn: () => careEpisodeApi.getCareEpisodeVerifications(),
    enabled: workshopId !== null,
    retry: false,
  });

  // Estado local por item: el backend confirma; la UI refleja el cambio sin
  // refetch (el item sale de la cola en el próximo GET).
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});

  // Ítem elegido para confirmar (dialog abierto). null = dialog cerrado.
  const [pendingItem, setPendingItem] =
    useState<CareEpisodeVerificationItem | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Ítem elegido para RECHAZAR (dialog abierto) + motivo opcional (≤500).
  const [pendingRejectItem, setPendingRejectItem] =
    useState<CareEpisodeVerificationItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const closeRejectDialog = () => {
    setPendingRejectItem(null);
    setRejectReason("");
  };

  const executeVerify = async (item: CareEpisodeVerificationItem) => {
    setIsVerifying(true);
    try {
      await careEpisodeApi.verifyCareEpisode(item.id);
      setItemStates((prev) => ({ ...prev, [item.id]: { status: "verified" } }));
    } catch (error) {
      const status = (error as { status?: number }).status;
      let message = "No se pudo confirmar el episodio. Intentalo nuevamente.";
      if (status === 403) {
        message =
          "Este episodio no puede confirmarse: no tenés permisos o es un episodio de taller.";
      } else if (status === 404) {
        message = "El episodio ya no está disponible para tu taller.";
      } else if (status === 409) {
        message = "Este episodio ya fue verificado por otro taller.";
      }
      setItemStates((prev) => ({
        ...prev,
        [item.id]: { status: "error", message },
      }));
    } finally {
      setIsVerifying(false);
      // Cierra el dialog en éxito y en error: el resultado se lee en la card
      // (verificado o mensaje de error), no dentro del diálogo.
      setPendingItem(null);
    }
  };

  /**
   * Rechazo de verificación (diseño aprobado): POST /care-episodes/:id/reject
   * con motivo opcional. Mapeo de errores 403/404/409 por item, mismo patrón
   * que `executeVerify`: el resultado se lee en la card, no en el diálogo.
   */
  const executeReject = async (item: CareEpisodeVerificationItem) => {
    setIsRejecting(true);
    try {
      const reason = rejectReason.trim();
      await careEpisodeApi.rejectCareEpisode(item.id, reason || undefined);
      setItemStates((prev) => ({ ...prev, [item.id]: { status: "rejected" } }));
      // Invalidaciones (best-effort con allSettled: un fallo de refetch NO
      // convierte un rechazo exitoso en error). Cola (el item sale en el
      // próximo GET), listado de atenciones, detalle del episodio y
      // historial del vehículo — las superficies del propietario que
      // muestran el estado de verificación.
      await Promise.allSettled([
        queryClient.invalidateQueries({
          queryKey: ["care-episode-verifications"],
        }),
        queryClient.invalidateQueries({ queryKey: ["care-episode-list"] }),
        queryClient.invalidateQueries({ queryKey: ["care-episode"] }),
        queryClient.invalidateQueries({
          queryKey: [...vehicleKeys.detail(item.vehicleId), "history"],
        }),
      ]);
    } catch (error) {
      const status = (error as { status?: number }).status;
      let message = "No se pudo rechazar el episodio. Intentalo nuevamente.";
      if (status === 403) {
        message =
          "Este episodio no puede rechazarse: no tenés permisos o es un episodio de taller.";
      } else if (status === 404) {
        message = "El episodio ya no está disponible para tu taller.";
      } else if (status === 409) {
        message = "Este episodio ya fue resuelto y no se puede rechazar.";
      }
      setItemStates((prev) => ({
        ...prev,
        [item.id]: { status: "error", message },
      }));
    } finally {
      setIsRejecting(false);
      // Mismo criterio que verify: el diálogo se cierra en éxito y en error.
      closeRejectDialog();
    }
  };

  // Sin taller seleccionado: WORKSHOP-only por diseño (D-024 A2 / D-035).
  if (workshopId === null) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <Heading />
        <Card>
          <CardContent>
            <p role="status" className="text-sm text-muted-foreground">
              Para ver las verificaciones pendientes necesitás operar en el
              contexto de un taller.{" "}
              {hasWorkshopMembership
                ? "Entrá a la sección Talleres del menú y elegí tu taller para activar su contexto."
                : "Todavía no formás parte de un taller. Pedí una invitación por email para sumarte al equipo de uno."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Heading />

      {itemsQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground" role="status">
              Cargando verificaciones...
            </p>
          </CardContent>
        </Card>
      ) : itemsQuery.isError ? (
        <Card>
          <CardContent className="grid gap-3 py-6 text-center">
            <p className="text-sm text-destructive" role="alert">
              No se pudieron cargar las verificaciones pendientes.
            </p>
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void itemsQuery.refetch()}
              >
                <RotateCw className="h-3.5 w-3.5" />
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : itemsQuery.data?.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={ShieldCheck}
              title="Sin verificaciones pendientes"
              description="Cuando un propietario registre un servicio y te declare como taller responsable, vas a verlo acá para confirmarlo."
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {itemsQuery.data?.map((item) => {
            const state = itemStates[item.id] ?? { status: "pending" };
            return (
              <li key={item.id}>
                <Card>
                  <CardContent className="grid gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{item.title}</p>
                      {state.status === "verified" ? (
                        <Badge
                          variant="success"
                          data-testid={`verified-${item.id}`}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Verificado por {workshopName ?? "este taller"}
                        </Badge>
                      ) : state.status === "rejected" ? (
                        <Badge
                          variant="destructive"
                          data-testid={`rejected-${item.id}`}
                        >
                          Rechazado
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          Pendiente de verificación
                        </Badge>
                      )}
                    </div>

                    <div className="grid gap-1 text-sm">
                      <p className="text-muted-foreground">
                        {formatDateOnly(item.serviceDate)}
                        {item.mileageIn != null
                          ? ` · ${item.mileageIn.toLocaleString("es-AR")} km`
                          : ""}
                      </p>
                      <p className="font-medium">
                        {item.vehicle.licensePlate}{" "}
                        <span className="text-muted-foreground">
                          ({vehicleSummary(item)})
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Propietario: {item.owner.firstName} {item.owner.lastName}
                      </p>
                      {item.notes ? (
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground/80">
                          {item.notes}
                        </p>
                      ) : null}
                    </div>

                    {state.status === "error" && (
                      <p className="text-sm text-destructive" role="alert">
                        {state.message}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      {state.status !== "verified" &&
                        state.status !== "rejected" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => setPendingItem(item)}
                            >
                              Confirmar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRejectReason("");
                                setPendingRejectItem(item);
                              }}
                            >
                              Rechazar
                            </Button>
                          </>
                        )}
                      <Link
                        href={`/vehicles/${item.vehicleId}/servicios/${item.id}`}
                        aria-label={`Ver detalle de ${item.title}`}
                        className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary transition-colors outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                      >
                        Ver detalle
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Dialog de confirmación (reemplaza al window.confirm nativo). */}
      <Dialog
        open={pendingItem !== null}
        onOpenChange={(open) => {
          if (!open && !isVerifying) setPendingItem(null);
        }}
      >
        {pendingItem ? (
          <DialogPopup className="sm:max-w-md">
            <DialogTitle>Confirmar verificación</DialogTitle>
            <DialogDescription>
              Vas a confirmar que {workshopName ?? "tu taller"} realizó “
              {pendingItem.title}”. Esta acción queda registrada en la historia
              del vehículo y no se puede deshacer.
            </DialogDescription>
            <div className="mt-2 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={isVerifying}
                onClick={() => setPendingItem(null)}
              >
                Cancelar
              </Button>
              <Button
                disabled={isVerifying}
                onClick={() => void executeVerify(pendingItem)}
              >
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Sí, confirmar
              </Button>
            </div>
          </DialogPopup>
        ) : null}
      </Dialog>

      {/* Dialog de rechazo (diseño aprobado — motivo opcional, sin toasts). */}
      <Dialog
        open={pendingRejectItem !== null}
        onOpenChange={(open) => {
          if (!open && !isRejecting) closeRejectDialog();
        }}
      >
        {pendingRejectItem ? (
          <DialogPopup className="sm:max-w-md">
            <DialogTitle>Rechazar registro</DialogTitle>
            <DialogDescription>
              Vas a indicar que {workshopName ?? "tu taller"} no realizó «
              {pendingRejectItem.title}». Esta acción queda registrada en la
              historia del vehículo y no se puede deshacer.
            </DialogDescription>
            <div className="grid gap-2">
              <Label htmlFor="rejection-reason">Motivo (opcional)</Label>
              <Textarea
                id="rejection-reason"
                maxLength={500}
                placeholder="Ej.: no consta en nuestros registros"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={isRejecting}
                onClick={closeRejectDialog}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={isRejecting}
                onClick={() => void executeReject(pendingRejectItem)}
              >
                {isRejecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                Sí, rechazar
              </Button>
            </div>
          </DialogPopup>
        ) : null}
      </Dialog>
    </div>
  );
}

function Heading() {
  return (
    <div>
      <Link
        href="/dashboard"
        className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Volver al inicio
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">
        Verificaciones
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Confirmá los servicios registrados por propietarios que te declararon
        como taller responsable.
      </p>
    </div>
  );
}
