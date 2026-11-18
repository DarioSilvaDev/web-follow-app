"use client";

/**
 * Panel de reclamo del vehículo en el detalle de la atención (F-2, copy §2).
 *
 * Card después de "Evidencia" en `/vehicles/[id]/servicios/[servicioId]`.
 * Sólo se monta cuando el contexto activo es el taller del episodio
 * (`activeWorkshopId === workshopId`).
 *
 * Datos: `GET vehicle-claims?page=1&limit=100` (query compartida con
 * /reclamos, filtrada en cliente por vehicleId — el backend no expone filtro
 * por vehículo, gap reportado) + `GET vehicle-claims/:id` para el detalle
 * (claimant, QR, fechas). Ambas bajo el prefijo `["vehicle-claims"]` para
 * invalidar de una vez.
 *
 * Estados §2.1–§2.10 mapeados del `status` EFECTIVO del detalle:
 * - pending/verification_required/verified → §2.3 vigente
 * - expired → §2.4 · revoked (+max_attempts) → §2.5 / §2.10
 * - claimed → §2.7 · manual_review → §2.8 · claim_blocked → §2.9
 * - sin invite → §2.1 · link recién generado (con `link`) → §2.2
 *
 * §2.6 (vehículo ya con titular): si `vehicleHasActiveOwner` (dato aditivo del
 * detalle del episodio, D-TL-VC-9 regla 2) o el create rebota con 409 "ya tiene
 * titular", §2.1 muestra sólo el aviso y oculta "Generar link de reclamo".
 *
 * Permisos UX (la autoridad es el backend): `vehicle-claim.list` para ver el
 * panel, `.create` / `.revoke` / `.review` por acción (CTAs ocultos si falta).
 * Errores → copy §2.14, nunca el mensaje crudo del backend.
 *
 * Presentación (mejora UX, copy §2 intacto):
 * - §2.2: campo link como `Input` readonly con label + `title` (la URL nunca
 *   desborda; se selecciona con un click) y feedback `¡Copiado!` con
 *   `aria-live`. El QR preview convive con el link (lado a lado en sm+,
 *   apilado en chico) y sus errores ya se ven también en §2.2.
 * - §2.3: estado (badge + vencimiento) arriba; QR y acciones lado a lado en
 *   sm+, apilados en chico.
 * - El label visible "Link de reclamo" es chrome de campo (aditivo al spec
 *   §2.2, que sólo fija el copy de CTA/microcopy).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Download,
  Loader2,
  MessageCircle,
  RotateCw,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useActiveContext } from "@/hooks/use-active-context";
import { canInWorkshop } from "@/lib/admin-access";
import { vehicleClaimApi } from "@/lib/api";
import {
  CLAIM_PANEL_ALREADY_TAKEN,
  CLAIM_PANEL_ALREADY_TAKEN_HELPER,
  CLAIM_PANEL_ACTION_ERROR,
  CLAIM_PANEL_NO_PERMISSION,
  CLAIM_PANEL_NOT_FOUND,
  CLAIM_PANEL_QR_ERROR,
  isClaimAlreadyTaken,
  resolveClaimPanelMessage,
} from "@/lib/vehicle-claim-errors";
import type {
  WorkshopClaimCreateData,
  WorkshopClaimDetail,
} from "@/types/vehicle-claim";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ClaimInvitePanel({
  vehicleId,
  careEpisodeId,
  licensePlate: episodePlate,
  workshopId,
  vehicleHasActiveOwner = false,
}: {
  vehicleId: string;
  careEpisodeId: string;
  /** Patente del episodio (fallback antes de que cargue el detalle). */
  licensePlate: string;
  /**
   * workshopId del episodio (`null` en episodios sin taller — el gate de
   * montaje contra el contexto activo nunca matchea y el panel no se pinta).
   */
  workshopId: string | null;
  /**
   * `detail.vehicle.hasActiveOwner` del episodio (contrato aditivo D-TL-VC-9
   * regla 2, copy §2.6): el vehículo ya tiene titular. En §2.1 se muestra sólo
   * el aviso de "ya tiene titular" y NO se ofrece "Generar link de reclamo"
   * (el backend responde 409 `active_owner`). Omitido/false en deploys viejos
   * del backend → se mantiene el CTA.
   */
  vehicleHasActiveOwner?: boolean;
}) {
  const activeContext = useActiveContext();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const activeWorkshopId =
    activeContext?.type === "WORKSHOP" ? activeContext.workshopId : null;

  const [freshLink, setFreshLink] = useState<WorkshopClaimCreateData | null>(
    null,
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [alreadyTaken, setAlreadyTaken] = useState(false);
  const [dialog, setDialog] = useState<
    "revoke" | "approve" | "reject" | null
  >(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Gates de UX (nunca security boundary — backend enforcea) ──
  // `canInWorkshop`: el owner/mecánico no tiene roles de sistema (`roles: []`);
  // sus permisos vienen en la membresía del taller activo.
  const canList = canInWorkshop(user, activeWorkshopId, "vehicle-claim.list");
  const canCreate = canInWorkshop(
    user,
    activeWorkshopId,
    "vehicle-claim.create",
  );
  const canRevoke = canInWorkshop(
    user,
    activeWorkshopId,
    "vehicle-claim.revoke",
  );
  const canReview = canInWorkshop(
    user,
    activeWorkshopId,
    "vehicle-claim.review",
  );

  const listQuery = useQuery({
    queryKey: ["vehicle-claims", "list", workshopId],
    queryFn: () => vehicleClaimApi.listClaims({ page: 1, limit: 100 }),
    enabled: canList && activeWorkshopId !== null && activeWorkshopId === workshopId,
    retry: false,
  });

  const invite = listQuery.data?.data.find(
    (item) => item.vehicleId === vehicleId,
  );
  const inviteId = invite?.id ?? null;

  const detailQuery = useQuery({
    queryKey: ["vehicle-claims", "detail", inviteId],
    queryFn: () => vehicleClaimApi.getClaim(inviteId as string),
    enabled: inviteId !== null,
    retry: false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["vehicle-claims"] });

  const createMutation = useMutation({
    mutationFn: () =>
      vehicleClaimApi.createClaim({ vehicleId, careEpisodeId }),
    onSuccess: (data) => {
      setAlreadyTaken(false);
      setCreateError(null);
      // `link` sólo viene en creación/reactivación (token nuevo); en
      // reutilización idempotente no hay link → se refresca al estado §2.3.
      setFreshLink(data.link ? data : null);
      setQrError(null);
      void invalidate();
    },
    onError: (error) => {
      if (isClaimAlreadyTaken(error)) {
        setAlreadyTaken(true);
        setCreateError(null);
        return;
      }
      setCreateError(resolveClaimPanelMessage(error));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => vehicleClaimApi.revokeClaim(inviteId as string),
    onSuccess: () => {
      setDialog(null);
      setDialogError(null);
      setFreshLink(null);
      void invalidate();
    },
    onError: (error) => setDialogError(resolveClaimPanelMessage(error)),
  });

  const approveMutation = useMutation({
    mutationFn: () => vehicleClaimApi.approveClaim(inviteId as string),
    onSuccess: () => {
      setDialog(null);
      setDialogError(null);
      void invalidate();
    },
    onError: (error) => setDialogError(resolveClaimPanelMessage(error)),
  });

  const rejectMutation = useMutation({
    mutationFn: () => vehicleClaimApi.rejectClaim(inviteId as string),
    onSuccess: () => {
      setDialog(null);
      setDialogError(null);
      void invalidate();
    },
    onError: (error) => setDialogError(resolveClaimPanelMessage(error)),
  });

  const closeDialog = (open: boolean) => {
    if (open) return;
    if (
      revokeMutation.isPending ||
      approveMutation.isPending ||
      rejectMutation.isPending
    ) {
      return;
    }
    setDialog(null);
    setDialogError(null);
  };

  const handleCopy = async () => {
    if (!freshLink?.link) return;
    try {
      await navigator.clipboard.writeText(freshLink.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin permiso de portapapeles → no bloqueamos la acción principal.
    }
  };

  const handleWhatsApp = () => {
    if (!freshLink?.whatsappUrl) return;
    window.open(freshLink.whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownloadQr = async (url: string | null) => {
    if (!url) {
      setQrError(CLAIM_PANEL_QR_ERROR);
      return;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("qr fetch failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `qr-reclamo-${episodePlate}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
      setQrError(null);
    } catch {
      // R2 firmado con CORS limitado o red caída → copy §2.14.
      setQrError(CLAIM_PANEL_QR_ERROR);
    }
  };

  // ── Gate de montaje: sólo el taller del episodio ve el panel ──
  if (activeWorkshopId === null || activeWorkshopId !== workshopId) {
    return null;
  }

  // Preferencia de producto: si el vehículo ya tiene titular (dato del detalle
  // del episodio, D-TL-VC-9 regla 2), la tarjeta no se muestra en absoluto.
  // Se evita también el flash del spinner mientras carga la lista. El caso
  // defensivo (POST create → 409 "ya tiene titular", p.ej. vehículo de taller
  // transferido después) sigue mostrando §2.6 para que el fallo no sea
  // silencioso.
  if (vehicleHasActiveOwner === true) {
    if (listQuery.isLoading) return null;
    if (!invite) return null;
  }

  const header = (
    <CardHeader>
      <CardTitle>Reclamo del vehículo</CardTitle>
      <CardDescription>
        Generá un link para que el dueño reclame el historial de este vehículo.
      </CardDescription>
    </CardHeader>
  );

  // ── Sin permiso: sin request, copy §2.14 ──
  if (!canList) {
    return (
      <Card>
        {header}
        <CardContent>
          <Callout variant="info" role="status">
            {CLAIM_PANEL_NO_PERMISSION}
          </Callout>
        </CardContent>
      </Card>
    );
  }

  // ── Carga / error de la lista ──
  if (listQuery.isLoading) {
    return (
      <Card>
        {header}
        <CardContent className="flex items-center justify-center gap-2 py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground" role="status">
            Cargando el reclamo…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (listQuery.isError) {
    const status = (listQuery.error as { status?: number } | undefined)
      ?.status;
    const isForbidden = status === 403;
    return (
      <Card>
        {header}
        <CardContent className="grid gap-3 py-4">
          <Callout
            variant={isForbidden ? "info" : "destructive"}
            role={isForbidden ? "status" : "alert"}
          >
            {isForbidden
              ? CLAIM_PANEL_NO_PERMISSION
              : CLAIM_PANEL_ACTION_ERROR}
          </Callout>
          {!isForbidden && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void listQuery.refetch()}
              >
                <RotateCw className="h-3.5 w-3.5" />
                Reintentar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── §2.1 sin invite ──
  if (!invite) {
    // Preferencia de producto: si el vehículo ya tiene titular (dato del detalle
    // del episodio, D-TL-VC-9 regla 2), la tarjeta de reclamo no se muestra en
    // absoluto — no hay CTA válido. El caso defensivo (POST create → 409
    // "ya tiene titular", p.ej. vehículo de taller transferido después) sigue
    // mostrando §2.6 para que el fallo no sea silencioso.
    if (vehicleHasActiveOwner === true) {
      return null;
    }

    // §2.6: el create acaba de rebotar con 409 "ya tiene titular" (`alreadyTaken`).
    // En ese caso se muestra sólo el aviso y se oculta el CTA.
    const alreadyHasOwner = alreadyTaken;

    return (
      <Card>
        {header}
        <CardContent className="grid gap-3">
          {alreadyHasOwner && (
            <div className="grid gap-1">
              <Callout variant="info" role="status">
                {CLAIM_PANEL_ALREADY_TAKEN}
              </Callout>
              <p className="text-xs text-muted-foreground">
                {CLAIM_PANEL_ALREADY_TAKEN_HELPER}
              </p>
            </div>
          )}
          {createError && (
            <Callout variant="destructive" role="alert">
              {createError}
            </Callout>
          )}
          {!alreadyHasOwner && (
            <>
              <div className="grid gap-1">
                <p className="text-sm">
                  Este vehículo todavía no tiene un link de reclamo.
                </p>
                <p className="text-xs text-muted-foreground">
                  El dueño va a poder ver el historial completo después de
                  verificar que el vehículo es suyo.
                </p>
              </div>
              {canCreate && (
                <Button
                  type="button"
                  disabled={createMutation.isPending}
                  aria-busy={createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generando…
                    </>
                  ) : (
                    "Generar link de reclamo"
                  )}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── §2.2 invite recién generado (link visible una sola vez) ──
  // Tiene prioridad sobre el detalle: no depende de `GET :id` y evita un
  // flash de loading mientras la lista/detalle se invalidan.
  if (freshLink) {
    const freshPlate = freshLink.licensePlate || episodePlate;
    return (
      <Card>
        {header}
        <CardContent className="grid gap-4">
          {qrError && (
            <Callout variant="destructive" role="alert" icon={TriangleAlert}>
              {qrError}
            </Callout>
          )}

          <Callout variant="warning" role="status" icon={TriangleAlert}>
            Guardá o compartí el link ahora. Por seguridad, no se vuelve a
            mostrar.
          </Callout>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* Columna principal: link + acciones */}
            <div className="grid min-w-0 flex-1 gap-3">
              <div className="grid gap-1.5">
                <Label
                  htmlFor="claim-invite-link"
                  className="text-xs text-muted-foreground"
                >
                  Link de reclamo
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="claim-invite-link"
                    readOnly
                    value={freshLink.link ?? ""}
                    title={freshLink.link ?? undefined}
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-w-0 grow basis-56 font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check
                        className="mr-1.5 h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <Copy
                        className="mr-1.5 h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    )}
                    <span aria-live="polite">
                      {copied ? "¡Copiado!" : "Copiar enlace"}
                    </span>
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {freshLink.whatsappUrl && (
                  <Button type="button" onClick={handleWhatsApp}>
                    <MessageCircle
                      className="mr-1.5 h-4 w-4"
                      aria-hidden="true"
                    />
                    Enviar por WhatsApp
                  </Button>
                )}
                <Button
                  type="button"
                  variant={freshLink.whatsappUrl ? "outline" : "default"}
                  onClick={() => void handleDownloadQr(freshLink.qrImageUrl)}
                >
                  <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Descargar QR
                </Button>
              </div>
            </div>

            {/* QR al lado del link en sm+; debajo en chico */}
            {freshLink.qrImageUrl && (
              <div className="flex shrink-0 justify-center sm:justify-start">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2 que caduca: next/image no sirve para QR efímeros (mismo criterio que evidence-gallery) */}
                <img
                  src={freshLink.qrImageUrl}
                  alt={`Código QR del link de reclamo de ${freshPlate}`}
                  className="h-40 w-40 rounded-lg border border-border bg-white p-2"
                  onError={() => setQrError(CLAIM_PANEL_QR_ERROR)}
                />
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Si perdés el link, podés revocarlo y generar uno nuevo.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Detalle ──
  if (detailQuery.isLoading) {
    return (
      <Card>
        {header}
        <CardContent className="flex items-center justify-center gap-2 py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground" role="status">
            Cargando el reclamo…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    const status = (detailQuery.error as { status?: number } | undefined)
      ?.status;
    const isNotFound = status === 404;
    return (
      <Card>
        {header}
        <CardContent className="grid gap-3 py-4">
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
    );
  }

  const detail: WorkshopClaimDetail = detailQuery.data;
  const plate = detail.vehicle.licensePlate || episodePlate;
  const claimantName = detail.claimant
    ? `${detail.claimant.firstName} ${detail.claimant.lastName}`.trim()
    : null;
  const showReviewActions = canReview && detail.status === "manual_review";

  // ── Diálogos compartidos: §2.11 (revocar), §2.12 (aprobar), §2.13 (rechazar) ──
  // Se renderizan en §2.3 (vigente), §2.7 (reclamado → Revocar reclamo) y
  // §2.8 (revisión manual → aprobar/rechazar). En §2.2 (link recién
  // generado) y en los estados cerrados NO hay acciones de revoke/review.
  const dialogs = (
    <>
      {/* ── §2.11 confirmación de revocación (§2.3/§2.5 y §2.7) ── */}
      <Dialog open={dialog === "revoke"} onOpenChange={closeDialog}>
        <DialogPopup>
          <DialogTitle>¿Revocar el link de reclamo?</DialogTitle>
          <DialogDescription>
            El link va a dejar de funcionar. Si el dueño todavía no reclamó,
            vas a tener que generar uno nuevo.
          </DialogDescription>
          {dialogError && (
            <p className="text-sm text-destructive" role="alert">
              {dialogError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose
              render={
                <Button variant="outline" disabled={revokeMutation.isPending} />
              }
            >
              Cancelar
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={revokeMutation.isPending}
              aria-busy={revokeMutation.isPending}
              onClick={() => revokeMutation.mutate()}
            >
              {revokeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Revocando…
                </>
              ) : (
                "Revocar link"
              )}
            </Button>
          </div>
        </DialogPopup>
      </Dialog>

      {/* ── §2.12 confirmación de aprobación ── */}
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

      {/* ── §2.13 confirmación de rechazo ── */}
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
    </>
  );

  const status = detail.status;
  const isAutoRevoked = status === "revoked" && detail.revokeReason === "max_attempts";

  const createButton = (label: string) =>
    canCreate ? (
      <Button
        type="button"
        disabled={createMutation.isPending}
        aria-busy={createMutation.isPending}
        onClick={() => createMutation.mutate()}
      >
        {createMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generando…
          </>
        ) : (
          label
        )}
      </Button>
    ) : null;

  const createErrorCallout = createError ? (
    <Callout variant="destructive" role="alert">
      {createError}
    </Callout>
  ) : null;

  // ── §2.4 / §2.5 / §2.10 — estados cerrados con "Generar link nuevo" ──
  if (status === "expired" || (status === "revoked" && !isAutoRevoked) || isAutoRevoked) {
    const expired = status === "expired";
    return (
      <Card>
        {header}
        <CardContent className="grid gap-3">
          {createErrorCallout}
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {expired
                ? "Vencido"
                : isAutoRevoked
                  ? "Revocado automáticamente"
                  : "Revocado"}
            </Badge>
          </div>
          <div className="grid gap-1">
            {expired ? (
              <p className="text-sm">El link venció y el dueño ya no puede usarlo.</p>
            ) : isAutoRevoked ? (
              <>
                <p className="text-sm">
                  El link se revocó después de 3 bloqueos de verificación.
                </p>
                <p className="text-xs text-muted-foreground">
                  Si el dueño todavía necesita reclamar, generá un link nuevo y
                  entregalo en persona.
                </p>
              </>
            ) : (
              <p className="text-sm">Este link ya no funciona.</p>
            )}
          </div>
          {createButton("Generar link nuevo")}
        </CardContent>
      </Card>
    );
  }

  // ── §2.7 reclamado ──
  if (status === "claimed") {
    return (
      <Card>
        {header}
        <CardContent className="grid gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="info">Reclamado</Badge>
          </div>
          <p className="text-sm">
            {claimantName
              ? `${claimantName} reclamó el vehículo ${plate}.`
              : `Alguien reclamó el vehículo ${plate}.`}
          </p>
          <div className="grid gap-1">
            <p className="text-xs text-muted-foreground">
              No necesitás hacer nada. Si el reclamo no corresponde, podés
              revocarlo.
            </p>
          </div>
          {canRevoke && (
            <div>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setDialogError(null);
                  setDialog("revoke");
                }}
              >
                Revocar reclamo
              </Button>
            </div>
          )}
          {dialogs}
        </CardContent>
      </Card>
    );
  }

  // ── §2.8 revisión manual ──
  if (status === "manual_review") {
    return (
      <Card>
        {header}
        <CardContent className="grid gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="warning">A revisar</Badge>
          </div>
          <div className="grid gap-1">
            <p className="text-sm">
              {claimantName
                ? `${claimantName} reclamó el vehículo, pero no pudimos verificarlo automáticamente.`
                : `Alguien reclamó el vehículo ${plate}, pero no pudimos verificarlo automáticamente.`}
            </p>
            {detail.claimant && (
              <p className="text-sm text-muted-foreground">
                Cuenta: {detail.claimant.email}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Aprobá sólo si reconocés al dueño. Si no, rechazá el reclamo.
            </p>
          </div>
          {showReviewActions && (
            <div className="flex flex-wrap gap-2">
              {claimantName && (
                <Button
                  type="button"
                  onClick={() => {
                    setDialogError(null);
                    setDialog("approve");
                  }}
                >
                  Aprobar reclamo
                </Button>
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
          {dialogs}
        </CardContent>
      </Card>
    );
  }

  // ── §2.9 reclamo bloqueado ──
  if (status === "claim_blocked") {
    return (
      <Card>
        {header}
        <CardContent className="grid gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="destructive">Bloqueado</Badge>
          </div>
          <p className="text-sm">
            Alguien intentó reclamar el vehículo {plate}, pero ya tiene
            titular.
          </p>
          <p className="text-xs text-muted-foreground">No necesitás hacer nada.</p>
        </CardContent>
      </Card>
    );
  }

  // ── §2.3 invite vigente (pending / verification_required / verified) ──
  return (
    <Card>
      {header}
      <CardContent className="grid gap-4">
        {createErrorCallout}

        {qrError && (
          <Callout variant="destructive" role="alert" icon={TriangleAlert}>
            {qrError}
          </Callout>
        )}
        {!detail.qrImageUrl && !qrError && (
          <Callout variant="destructive" role="alert" icon={TriangleAlert}>
            {CLAIM_PANEL_QR_ERROR}
          </Callout>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">Vigente</Badge>
          <span className="text-sm text-muted-foreground">
            Vence el {formatDate(detail.expiresAt)}.
          </span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {detail.qrImageUrl && (
            <div className="flex shrink-0 justify-center sm:justify-start">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2 que caduca: next/image no sirve para QR efímeros (mismo criterio que evidence-gallery) */}
              <img
                src={detail.qrImageUrl}
                alt={`Código QR del link de reclamo de ${plate}`}
                className="h-40 w-40 rounded-lg border border-border bg-white p-2"
                onError={() => setQrError(CLAIM_PANEL_QR_ERROR)}
              />
            </div>
          )}

          <div className="grid min-w-0 flex-1 gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleDownloadQr(detail.qrImageUrl)}
              >
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Descargar QR
              </Button>
              {canRevoke && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    setDialogError(null);
                    setDialog("revoke");
                  }}
                >
                  Revocar link
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Por seguridad, el link no se vuelve a mostrar. Compartí el QR o
              revocá el link para generar uno nuevo.
            </p>
          </div>
        </div>
      </CardContent>

      {dialogs}
    </Card>
  );
}
