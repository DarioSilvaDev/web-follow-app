"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import { canInWorkshop } from "@/lib/admin-access";
import { vehicleClaimApi } from "@/lib/api";
import {
  CLAIM_PANEL_APPROVE_NO_ACCOUNT,
  CLAIM_PANEL_NO_PERMISSION,
  CLAIM_PANEL_NOT_FOUND,
  CLAIM_PANEL_ACTION_ERROR,
  resolveClaimPanelMessage,
} from "@/lib/vehicle-claim-errors";
import { CLAIM_STATUS_BADGES } from "@/components/vehicle-claim/claim-status";
import type { WorkshopClaimDetail } from "@/types/vehicle-claim";

// ---------------------------------------------------------------------------
// F-2 (seguimiento) — "Reclamo" (detalle del reclamo, contexto WORKSHOP).
//
// Se accede desde /reclamos (cada tarjeta enlaza acá). Muestra los datos del
// invite (estado efectivo, patente, vehículo, fechas, intentos, QR) y, en
// `manual_review` con `vehicle-claim.review`, las acciones Aprobar/Rechazar
// (mismas confirmaciones §2.12/§2.13 que el panel de la atención).
//
// Permiso UX: `vehicle-claim.list` (la autoridad es el backend). El detalle
// del reclamante sólo lo expone el backend en `manual_review` con permiso
// `vehicle-claim.review`.
// ---------------------------------------------------------------------------

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReclamoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const activeContext = useActiveContext();
  const workshopId =
    activeContext?.type === "WORKSHOP" ? activeContext.workshopId : null;
  const { status, user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const hasWorkshopMembership = (user?.workshopMemberships?.length ?? 0) > 0;

  // Guard de membresía (PO): sin taller no hay journey de reclamos →
  // redirect a /dashboard (mismo patrón que /reclamos).
  useEffect(() => {
    if (status !== "loading" && !hasWorkshopMembership) {
      router.replace("/dashboard");
    }
  }, [status, hasWorkshopMembership, router]);

  // Gates por taller (UX — la autoridad es el backend).
  const canList = canInWorkshop(user, workshopId, "vehicle-claim.list");
  const canReview = canInWorkshop(user, workshopId, "vehicle-claim.review");

  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["vehicle-claims", "detail", id],
    queryFn: () => vehicleClaimApi.getClaim(id),
    enabled: canList && workshopId !== null,
    retry: false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["vehicle-claims"] });

  const approveMutation = useMutation({
    mutationFn: () => vehicleClaimApi.approveClaim(id),
    onSuccess: () => {
      setDialog(null);
      setDialogError(null);
      void invalidate();
    },
    onError: (error) => setDialogError(resolveClaimPanelMessage(error)),
  });

  const rejectMutation = useMutation({
    mutationFn: () => vehicleClaimApi.rejectClaim(id),
    onSuccess: () => {
      setDialog(null);
      setDialogError(null);
      void invalidate();
    },
    onError: (error) => setDialogError(resolveClaimPanelMessage(error)),
  });

  const closeDialog = (open: boolean) => {
    if (open) return;
    if (approveMutation.isPending || rejectMutation.isPending) return;
    setDialog(null);
    setDialogError(null);
  };

  // Sin taller seleccionado: WORKSHOP-only (mismo texto que /reclamos).
  if (workshopId === null) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Heading />
        <Card>
          <CardContent>
            <p role="status" className="text-sm text-muted-foreground">
              Para ver este reclamo necesitás operar en el contexto de un
              taller.{" "}
              {hasWorkshopMembership
                ? "Entrá a la sección Talleres del menú y elegí tu taller para activar su contexto."
                : "Todavía no formás parte de un taller."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sin permiso: sin request (§2.14).
  if (!canList) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Heading />
        <Card>
          <CardContent>
            <Callout variant="info" role="status">
              {CLAIM_PANEL_NO_PERMISSION}
            </Callout>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Heading />
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground" role="status">
              Cargando el reclamo…
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    const httpStatus = (
      detailQuery.error as { status?: number } | undefined
    )?.status;
    const isNotFound = httpStatus === 404;
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Heading />
        <Card>
          <CardContent className="grid gap-3">
            <Callout
              variant={isNotFound ? "info" : "destructive"}
              role={isNotFound ? "status" : "alert"}
            >
              {isNotFound ? CLAIM_PANEL_NOT_FOUND : CLAIM_PANEL_ACTION_ERROR}
            </Callout>
            {!isNotFound && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => void detailQuery.refetch()}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Reintentar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const detail: WorkshopClaimDetail = detailQuery.data;
  const badge = CLAIM_STATUS_BADGES[detail.status];
  const vehicleLabel = [
    detail.vehicle.brand,
    detail.vehicle.model,
    detail.vehicle.manufactureYear ? String(detail.vehicle.manufactureYear) : null,
  ]
    .filter(Boolean)
    .join(" ");
  const claimantName = detail.claimant
    ? `${detail.claimant.firstName} ${detail.claimant.lastName}`.trim()
    : null;
  const showReviewActions = canReview && detail.status === "manual_review";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Heading />

      <Card>
        <CardContent className="grid gap-4">
          {/* ── Encabezado: patente + estado ── */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-2xl font-bold tracking-tight">
              {detail.vehicle.licensePlate}
            </p>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          {vehicleLabel && (
            <p className="text-sm text-muted-foreground">{vehicleLabel}</p>
          )}

          {/* ── Datos del reclamo ── */}
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <DetailRow label="Creado" value={formatDateTime(detail.createdAt)} />
            <DetailRow label="Vence" value={formatDate(detail.expiresAt)} />
            <DetailRow
              label="Intentos fallidos"
              value={
                detail.failedAttempts > 0
                  ? `${detail.failedAttempts}${
                      detail.lastFailedAt
                        ? ` · último ${formatDateTime(detail.lastFailedAt)}`
                        : ""
                    }`
                  : "Ninguno"
              }
            />
            <DetailRow
              label="Intentos de verificación"
              value={String(detail.attempts.length)}
            />
            {detail.openedAt && (
              <DetailRow
                label="Abierto"
                value={formatDateTime(detail.openedAt)}
              />
            )}
            {detail.usedAt && (
              <DetailRow
                label="Reclamado"
                value={formatDateTime(detail.usedAt)}
              />
            )}
            {detail.status === "revoked" && detail.revokeReason && (
              <DetailRow label="Motivo de revocación" value={detail.revokeReason} />
            )}
          </dl>

          {/* ── QR (re-display, sin token) ── */}
          {detail.qrImageUrl && (
            <div className="grid gap-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                QR del reclamo
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={detail.qrImageUrl}
                alt={`QR del reclamo del vehículo ${detail.vehicle.licensePlate}`}
                className="h-40 w-40 rounded-md border border-border object-contain"
              />
            </div>
          )}

          {/* ── Revisión manual: cuenta del reclamante + acciones ── */}
          {detail.status === "manual_review" && (
            <div className="grid gap-2 border-t border-border pt-3">
              {claimantName ? (
                <>
                  <p className="text-sm">
                    {claimantName} reclamó el vehículo, pero no pudimos
                    verificarlo automáticamente.
                  </p>
                  {detail.claimant && (
                    <p className="text-sm text-muted-foreground">
                      Cuenta: {detail.claimant.email}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm">
                  Alguien reclamó el vehículo {detail.vehicle.licensePlate},
                  pero no pudimos verificarlo automáticamente.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Aprobá sólo si reconocés al dueño. Si no, rechazá el reclamo.
              </p>
              {showReviewActions && (
                <div className="flex flex-wrap items-center gap-2">
                  {claimantName ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setDialogError(null);
                        setDialog("approve");
                      }}
                    >
                      Aprobar reclamo
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground" role="status">
                      {CLAIM_PANEL_APPROVE_NO_ACCOUNT} Para aprobar, el
                      reclamante tiene que terminar de crear su cuenta.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogError(null);
                      setDialog("reject");
                    }}
                  >
                    Rechazar
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Acceso a la atención de origen ── */}
          {detail.careEpisodeId && (
            <div className="border-t border-border pt-3">
              <Link
                href={`/vehicles/${detail.vehicleId}/servicios/${detail.careEpisodeId}`}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Ver la atención de origen
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Confirmaciones §2.12 / §2.13 ── */}
      <Dialog open={dialog === "approve"} onOpenChange={closeDialog}>
        <DialogPopup>
          <DialogTitle>¿Aprobar el reclamo?</DialogTitle>
          <DialogDescription>
            {`El vehículo va a quedar a nombre de ${
              claimantName ?? "la persona que reclamó"
            }. Esta acción se puede revertir revocando el reclamo.`}
          </DialogDescription>
          {dialogError && (
            <p className="text-sm text-destructive" role="alert">
              {dialogError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose
              render={
                <Button variant="outline" disabled={approveMutation.isPending} />
              }
            >
              Cancelar
            </DialogClose>
            <Button
              type="button"
              disabled={approveMutation.isPending}
              aria-busy={approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aprobando…
                </>
              ) : (
                "Aprobar reclamo"
              )}
            </Button>
          </div>
        </DialogPopup>
      </Dialog>

      <Dialog open={dialog === "reject"} onOpenChange={closeDialog}>
        <DialogPopup>
          <DialogTitle>¿Rechazar el reclamo?</DialogTitle>
          <DialogDescription>
            El link va a dejar de funcionar y el vehículo va a quedar sin
            reclamar.
          </DialogDescription>
          {dialogError && (
            <p className="text-sm text-destructive" role="alert">
              {dialogError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose
              render={
                <Button variant="outline" disabled={rejectMutation.isPending} />
              }
            >
              Cancelar
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={rejectMutation.isPending}
              aria-busy={rejectMutation.isPending}
              onClick={() => rejectMutation.mutate()}
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Rechazando…
                </>
              ) : (
                "Rechazar reclamo"
              )}
            </Button>
          </div>
        </DialogPopup>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function Heading() {
  return (
    <div>
      <Link
        href="/reclamos"
        className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Volver a reclamos
      </Link>
      <div className="mt-3">
        <h1 className="text-2xl font-bold tracking-tight">Detalle del reclamo</h1>
      </div>
    </div>
  );
}
