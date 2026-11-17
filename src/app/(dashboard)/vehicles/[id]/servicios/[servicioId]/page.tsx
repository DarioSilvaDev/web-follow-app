"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Camera,
  Car,
  CheckCircle2,
  Gauge,
  Loader2,
  Lock,
  RotateCw,
  SearchX,
  Wrench,
} from "lucide-react";
import { cn } from "cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoCard } from "@/components/ui/info-card";
import { InfoField, InfoGrid } from "@/components/ui/info-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackLink, PageHeader, PageTitle } from "@/components/ui/page-header";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { typeScale } from "@/components/ui/type-scale";
import { AttachmentsUploader } from "@/components/care-episode/attachments-uploader";
import { EvidenceGallery } from "@/components/care-episode/evidence-gallery";
import { RemoveAttachmentDialog } from "@/components/care-episode/remove-attachment-dialog";
import { ClaimInvitePanel } from "@/components/vehicle-claim/claim-invite-panel";
import { useAuth } from "@/hooks/use-auth";
import { useActiveContext } from "@/hooks/use-active-context";
import { careEpisodeApi } from "@/lib/api";
import {
  resolveAttachmentDeleteErrorMessage,
  resolveCareEpisodeDetailErrorMessage,
} from "@/lib/care-episode-errors";
import {
  canRemoveAttachment,
  removalReasonRequired,
} from "@/lib/care-episode-permissions";
import { formatDateOnly } from "@/lib/format-date";
import { vehicleKeys } from "@/lib/query-keys";
import type {
  CareEpisodeAttachment,
  CloseCareEpisodeInput,
  RemovedAttachmentReason,
} from "@/types/care-episode";

// ---------------------------------------------------------------------------
// Iteración 2-4 (S1/S4/S5/S6) — Detalle del servicio (deep-linkable).
// Ruta: /vehicles/[id]/servicios/[servicioId]
// - GET   /care-episodes/:id (?signed=true) → proyección por actor (S1).
// - POST  /:id/attachments / DELETE /:id/attachments/:attachmentId → S4/S5.
// - La via de acceso 403 del backend se traduce a 404 (sin revelación); la
//   página maneja ambas terminales con Reintentar o un back-link contextual
//   (contexto WORKSHOP → /atenciones; resto → detalle del vehículo).
//
// Esta pantalla es la implementación de referencia del Design System:
// jerarquía (identidad → información del servicio → notas → evidencias),
// etiqueta/valor 12/15px, tarjetas radius 16px y badges de estado como pill.
// ---------------------------------------------------------------------------

/** Copy de UI para el cierre (403/404/409/400 del contrato B-3). */
function resolveCloseErrorMessage(error: unknown): string {
  const status = (error as { status?: number } | undefined)?.status;
  if (status === 400) {
    return "No se pudo cerrar: revisá el odómetro, el resumen y la foto del tablero si marcaste «no se puede leer».";
  }
  if (status === 403) {
    return "No tenés permiso para cerrar esta atención.";
  }
  if (status === 404) {
    return "La atención ya no está disponible para tu taller.";
  }
  if (status === 409) {
    return "Esta atención ya fue cerrada.";
  }
  return "No se pudo cerrar la atención. Intentalo nuevamente.";
}

export default function CareEpisodeDetailPage() {
  const params = useParams<{ id: string; servicioId: string }>();
  const vehicleId = params.id;
  const servicioId = params.servicioId;

  const { user } = useAuth();
  const activeContext = useActiveContext();
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["care-episode", servicioId] });

  const detailQuery = useQuery({
    queryKey: ["care-episode", servicioId],
    queryFn: () =>
      careEpisodeApi.getCareEpisodeDetail(servicioId, { signed: true }),
    retry: false,
  });

  const [attachmentToRemove, setAttachmentToRemove] =
    useState<CareEpisodeAttachment | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const removeMutation = useMutation({
    mutationFn: ({
      attachmentId,
      removedReason,
    }: {
      attachmentId: string;
      removedReason?: RemovedAttachmentReason;
    }) =>
      careEpisodeApi.deleteAttachment(
        servicioId,
        attachmentId,
        removedReason ? { removedReason } : {},
      ),
    onSuccess: () => {
      setAttachmentToRemove(null);
      setRemoveError(null);
      invalidate();
    },
    onError: (error) => {
      setRemoveError(resolveAttachmentDeleteErrorMessage(error));
    },
  });

  // ── Cierre de atención (B-3) ────────────────────────────────────────────
  // El odómetro es XOR: valor numérico O excepción "no legible" + motivo.
  // `serviceTypeIds` no se envía: el check-in ya cargó ≥1 tipo (ADR-005).
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [mileageOut, setMileageOut] = useState("");
  const [mileageOutUnreadable, setMileageOutUnreadable] = useState(false);
  const [mileageOutUnreadableReason, setMileageOutUnreadableReason] =
    useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeOutlierNotice, setCloseOutlierNotice] = useState(false);

  const resetCloseForm = () => {
    setMileageOut("");
    setMileageOutUnreadable(false);
    setMileageOutUnreadableReason("");
    setCloseNotes("");
    setCloseError(null);
  };

  const openCloseDialog = () => {
    resetCloseForm();
    // Precarga el odómetro de ingreso: si no cambió, el usuario lo deja tal
    // cual; si cambió, lo edita. `null` (ingreso ilegible) → campo vacío con
    // aviso en el modal.
    setMileageOut(detail.mileageIn !== null ? String(detail.mileageIn) : "");
    setCloseOutlierNotice(false);
    setCloseDialogOpen(true);
  };

  const closeMutation = useMutation({
    mutationFn: (input: CloseCareEpisodeInput) =>
      careEpisodeApi.closeCareEpisode(servicioId, input),
    onSuccess: async (response) => {
      setCloseDialogOpen(false);
      resetCloseForm();
      // `mileageOutlier` sólo viene en la respuesta (después del commit): no
      // alcanza para pedir confirmación PREVIA al envío. Se informa acá y se
      // escala la necesidad de un preflight al backend (ver reporte).
      if (response.data.mileageOutlier) setCloseOutlierNotice(true);
      await Promise.allSettled([
        queryClient.invalidateQueries({
          queryKey: ["care-episode", servicioId],
        }),
        queryClient.invalidateQueries({ queryKey: ["care-episode-list"] }),
        queryClient.invalidateQueries({
          queryKey: [...vehicleKeys.detail(vehicleId), "history"],
        }),
      ]);
    },
    onError: (error) => setCloseError(resolveCloseErrorMessage(error)),
  });

  const activeWorkshopId =
    activeContext?.type === "WORKSHOP" ? activeContext.workshopId : null;

  // Retorno contextual: en contexto de taller el detalle del vehículo no es
  // accesible (403), así que "volver" lleva a la lista de atenciones. El
  // resto de los actores (PERSONAL/DEALERSHIP) conserva el retorno al vehículo.
  const isWorkshopContext = activeContext?.type === "WORKSHOP";
  const backHref = isWorkshopContext ? "/atenciones" : `/vehicles/${vehicleId}`;
  const backLabel = isWorkshopContext
    ? "Volver a atenciones"
    : "Volver al vehículo";

  // ── Estados base ──
  if (detailQuery.isLoading) {
    return (
      <div
        role="status"
        aria-label="Cargando servicio"
        className="flex flex-col items-center justify-center gap-3 py-24"
      >
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <p className={cn("text-muted-foreground", typeScale.body)}>
          Cargando servicio...
        </p>
      </div>
    );
  }

  // El guard también cubre un data ausente sin `isError` (mismo patrón que
  // `vehicles/[id]/page.tsx` RF-6): evita que `detail` quede `undefined`
  // más abajo en el render.
  if (detailQuery.isError || !detailQuery.data) {
    const message = resolveCareEpisodeDetailErrorMessage(detailQuery.error);
    const isNotFound =
      (detailQuery.error as { status?: number } | undefined)?.status === 404;

    return (
      <div className="mx-auto w-full max-w-xl">
        <Card className="shadow-card">
          <CardContent>
            <EmptyState
              icon={isNotFound ? SearchX : Wrench}
              titleClassName="text-lg font-semibold"
              title={
                isNotFound
                  ? "Servicio no encontrado"
                  : "No se pudo cargar el servicio"
              }
              description={message}
              action={
                isNotFound ? (
                  <Link
                    href={backHref}
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "min-h-11 gap-2",
                    )}
                  >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {backLabel}
                  </Link>
                ) : (
                  <PrimaryButton onClick={() => detailQuery.refetch()}>
                    <RotateCw className="size-4" aria-hidden="true" />
                    Reintentar
                  </PrimaryButton>
                )
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const detail = detailQuery.data;

  // ── Cierre: visibilidad y validación local (defensa en profundidad) ──
  // Solo el taller dueño del episodio mientras está `open`. El backend sigue
  // siendo la frontera de enforcement (403/404/409); ocultar el botón es UX.
  const canClose =
    detail.status === "open" &&
    activeWorkshopId !== null &&
    activeWorkshopId === detail.workshopId;

  const parsedMileageOut = mileageOut.trim() === "" ? null : Number(mileageOut);
  const closeNotesTrimmed = closeNotes.trim();
  const mileageOk = mileageOutUnreadable
    ? mileageOutUnreadableReason.trim().length >= 3 &&
      mileageOutUnreadableReason.length <= 200
    : parsedMileageOut !== null &&
      Number.isInteger(parsedMileageOut) &&
      parsedMileageOut >= 0;
  const notesOk = closeNotesTrimmed.length >= 10 && closeNotes.length <= 1000;
  const belowMileageIn =
    !mileageOutUnreadable &&
    parsedMileageOut !== null &&
    detail.mileageIn !== null &&
    parsedMileageOut < detail.mileageIn;
  // El handler exige ≥1 adjunto `after` vigente cuando el odómetro es ilegible.
  const needsAfterPhoto =
    mileageOutUnreadable && (detail.attachments.after?.length ?? 0) === 0;
  const canSubmitClose =
    mileageOk && notesOk && !belowMileageIn && !closeMutation.isPending;

  const submitClose = () => {
    if (!canSubmitClose) return;
    const input: CloseCareEpisodeInput = { closeNotes: closeNotesTrimmed };
    if (mileageOutUnreadable) {
      input.mileageOutUnreadable = true;
      input.mileageOutUnreadableReason = mileageOutUnreadableReason.trim();
    } else if (parsedMileageOut !== null) {
      input.mileageOut = parsedMileageOut;
    } else {
      // Defensa: `mileageOk` ya impide este caso.
      return;
    }
    closeMutation.mutate(input);
  };

  // ── Permisos de evidencia (hint de UI; la autoridad es el backend) ──
  const permissionCtx = {
    currentUserId: user?.id ?? null,
    activeWorkshopId,
    isVehicleOwner: user?.isVehicleOwner ?? false,
    episodeWorkshopId: detail.workshopId,
  };
  const canRemove = canRemoveAttachment(permissionCtx);
  const reasonRequired = removalReasonRequired(permissionCtx);

  // ── Zona de subida S4 (espejo de assertWritableState del handler) ──
  const canUpload =
    detail.source === "workshop" &&
    activeWorkshopId === detail.workshopId &&
    detail.status === "open" &&
    detail.verification === "unverified";

  const vehicleName = [detail.vehicle.brand, detail.vehicle.model]
    .filter(Boolean)
    .join(" ");
  const vehicleLabel =
    [
      vehicleName || null,
      detail.vehicle.manufactureYear
        ? String(detail.vehicle.manufactureYear)
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || "—";
  const mileageLabel =
    detail.mileageIn !== null && detail.mileageIn !== undefined
      ? `${detail.mileageIn.toLocaleString("es-AR")} km`
      : "—";

  // Nivel de confianza (D-064): solo los episodios del propietario se
  // verifican; el rechazo conserva el nombre del taller responsable.
  const verificationBadge =
    detail.source === "owner" ? (
      detail.verification === "rejected" ? (
        <StatusBadge
          status="rejected"
          label={
            detail.workshopName
              ? `Rechazado por ${detail.workshopName}`
              : "Rechazado por el taller responsable"
          }
        />
      ) : (
        <StatusBadge
          status={
            detail.verification === "verified" ? "verified" : "unverified"
          }
        />
      )
    ) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-card-gap">
      <PageHeader back={<BackLink href={backHref}>{backLabel}</BackLink>} />

      {/* ── Identidad del servicio + información ── */}
      <InfoCard
        header={
          <PageTitle
            title={detail.title || "Servicio"}
            meta={
              <>
                <span className="font-medium text-foreground">
                  {detail.vehicle.licensePlate}
                </span>
                {vehicleName ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{vehicleName}</span>
                  </>
                ) : null}
              </>
            }
            actions={
              <>
                <StatusBadge status={detail.status} />
                {verificationBadge}
                {canClose ? (
                  <PrimaryButton onClick={openCloseDialog}>
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    Cerrar atención
                  </PrimaryButton>
                ) : null}
              </>
            }
          />
        }
      >
        <div className="border-t border-border/60 pt-4">
          <SectionHeader title="Información del servicio" />
          <InfoGrid className="mt-card">
            <InfoField
              icon={CalendarDays}
              label="Fecha del servicio"
              value={formatDateOnly(detail.serviceDate)}
            />
            <InfoField icon={Gauge} label="Kilometraje" value={mileageLabel} />
            <InfoField icon={Car} label="Vehículo" value={vehicleLabel} />
            <InfoField
              icon={Building2}
              label="Taller"
              value={detail.workshopName || "—"}
            />
          </InfoGrid>
        </div>

        {detail.customerComplaint ? (
          <div className="border-t border-border/60 pt-4">
            <InfoField
              label="Reclamo del cliente"
              value={detail.customerComplaint}
              valueClassName="whitespace-pre-wrap font-normal"
            />
          </div>
        ) : null}

        {detail.customerNotes ? (
          <div className="border-t border-border/60 pt-4">
            <InfoField
              label="Notas del cliente"
              value={detail.customerNotes}
              valueClassName="whitespace-pre-wrap font-normal"
            />
          </div>
        ) : null}

        {/* Solo el taller del episodio recibe internalNotes (proyección). */}
        {detail.internalNotes ? (
          <div className="rounded-control border border-border bg-muted/60 p-card">
            <p
              className={cn(
                "flex items-center gap-1.5 text-muted-foreground",
                typeScale.meta,
              )}
            >
              <Lock className="size-[18px] shrink-0" aria-hidden="true" />
              Notas internas
            </p>
            <p
              className={cn(
                "mt-label whitespace-pre-wrap text-foreground",
                typeScale.body,
              )}
            >
              {detail.internalNotes}
            </p>
          </div>
        ) : null}

        {/* D-207: diagnóstico / resumen del cierre (visible si las hay). */}
        {detail.closeNotes ? (
          <div className="border-t border-border/60 pt-4 bg-warning/20">
            <InfoField
              label="Diagnóstico / resumen"
              value={detail.closeNotes}
              valueClassName="whitespace-pre-wrap font-normal"
            />
          </div>
        ) : null}
      </InfoCard>

      {/* ── Rechazo de verificación (diseño aprobado) ── */}
      {detail.verification === "rejected" && (
        <Callout variant="destructive">
          <p>
            El taller responsable indicó que este servicio no corresponde a uno
            realizado por ellos.
          </p>
          {detail.rejectionReason ? (
            <p className="mt-1">Motivo: «{detail.rejectionReason}»</p>
          ) : null}
        </Callout>
      )}

      {/* ── Evidencia ── */}
      <InfoCard
        title="Evidencias"
        count={
          detail.attachmentCount > 0
            ? `${detail.attachmentCount} ${
                detail.attachmentCount === 1 ? "archivo" : "archivos"
              }`
            : undefined
        }
        description="Fotografías asociadas al servicio."
      >
        {canUpload && (
          <div className="rounded-control border border-dashed border-border bg-muted/30 p-card">
            <AttachmentsUploader
              episodeId={servicioId}
              defaultPhase="after"
              existingCount={detail.attachmentCount}
              onUploaded={invalidate}
            />
          </div>
        )}

        <EvidenceGallery
          groups={detail.attachments}
          canRemove={canRemove}
          onRemoveRequest={(attachment) => {
            setRemoveError(null);
            setAttachmentToRemove(attachment);
          }}
        />
      </InfoCard>

      {/* ── Reclamo del vehículo (F-2) ── */}
      <ClaimInvitePanel
        vehicleId={vehicleId}
        careEpisodeId={servicioId}
        licensePlate={detail.vehicle.licensePlate}
        workshopId={detail.workshopId}
        vehicleHasActiveOwner={detail.vehicle.hasActiveOwner === true}
      />

      {/* ── Cierre de atención (B-3) ── */}
      {closeOutlierNotice ? (
        <Callout variant="warning" icon={Gauge}>
          El odómetro de egreso quedó por debajo del máximo histórico del
          vehículo. La atención quedó registrada; revisá el valor si
          corresponde.
        </Callout>
      ) : null}

      <Dialog
        open={closeDialogOpen}
        onOpenChange={(open) => {
          if (!open && !closeMutation.isPending) setCloseDialogOpen(false);
        }}
      >
        {closeDialogOpen ? (
          <DialogPopup className="sm:max-w-lg">
            <DialogTitle>Cerrar atención</DialogTitle>
            <DialogDescription>
              Registrá el odómetro de egreso y un resumen de lo que se hizo. La
              atención pasa a «Entregado» y queda en la historia del vehículo.
            </DialogDescription>

            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                submitClose();
              }}
            >
              <fieldset className="grid gap-3 rounded-control border border-border/60 p-4">
                <legend className="px-1 text-sm font-semibold text-foreground">
                  Odómetro de egreso
                </legend>
                <div className="grid gap-2">
                  <Label htmlFor="mileage-out">Kilometraje</Label>
                  <Input
                    id="mileage-out"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    placeholder="Ej. 45600"
                    disabled={mileageOutUnreadable || closeMutation.isPending}
                    value={mileageOut}
                    onChange={(event) => setMileageOut(event.target.value)}
                    aria-invalid={belowMileageIn}
                  />
                  {detail.mileageIn !== null ? (
                    <p className={cn("text-muted-foreground", typeScale.meta)}>
                      Odómetro de ingreso:{" "}
                      {detail.mileageIn.toLocaleString("es-AR")} km · Dejalo tal
                      cual si no cambió.
                    </p>
                  ) : (
                    <p className={cn("text-muted-foreground", typeScale.meta)}>
                      No hay odómetro de ingreso legible; ingresá el valor o
                      marcá «No se puede leer».
                    </p>
                  )}
                  {belowMileageIn ? (
                    <p className="text-sm text-destructive" role="alert">
                      El egreso no puede ser menor al ingreso (
                      {detail.mileageIn?.toLocaleString("es-AR")} km).
                    </p>
                  ) : null}
                </div>

                <div className="flex items-start gap-2">
                  <input
                    id="mileage-out-unreadable"
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border"
                    checked={mileageOutUnreadable}
                    disabled={closeMutation.isPending}
                    onChange={(event) =>
                      setMileageOutUnreadable(event.target.checked)
                    }
                  />
                  <Label
                    htmlFor="mileage-out-unreadable"
                    className="font-normal"
                  >
                    No se puede leer el odómetro
                  </Label>
                </div>

                {mileageOutUnreadable ? (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="mileage-out-reason">
                        Motivo (mínimo 3 caracteres)
                      </Label>
                      <Textarea
                        id="mileage-out-reason"
                        rows={2}
                        maxLength={200}
                        placeholder="Ej. El tablero no enciende"
                        disabled={closeMutation.isPending}
                        value={mileageOutUnreadableReason}
                        onChange={(event) =>
                          setMileageOutUnreadableReason(event.target.value)
                        }
                      />
                    </div>
                    {needsAfterPhoto ? (
                      <Callout variant="warning" icon={Camera}>
                        Adjuntá una foto del tablero en «Evidencias» (fase
                        Después) antes de cerrar: el servidor la exige cuando el
                        odómetro no se puede leer.
                      </Callout>
                    ) : null}
                  </>
                ) : null}
              </fieldset>

              {/* Solo lectura: los tipos se fijaron en el check-in (ADR-005). */}
              {detail.serviceTypes?.length ? (
                <div className="grid gap-1">
                  <p
                    className={cn("text-muted-foreground", typeScale.label)}
                    id="close-service-types-label"
                  >
                    Tipos de atención (registrados en el ingreso)
                  </p>
                  <p
                    className={typeScale.body}
                    aria-labelledby="close-service-types-label"
                  >
                    {detail.serviceTypes
                      .map((item) => item.name ?? item.customLabel ?? item.code)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="close-notes">
                  Diagnóstico / resumen de la atención (obligatorio)
                </Label>
                <Textarea
                  id="close-notes"
                  rows={4}
                  maxLength={1000}
                  placeholder="Ej. Se reemplazó aceite y filtro; frenos revisados sin novedades."
                  disabled={closeMutation.isPending}
                  value={closeNotes}
                  onChange={(event) => setCloseNotes(event.target.value)}
                  aria-invalid={closeNotes.length > 0 && !notesOk}
                />
                <p
                  className={cn("text-muted-foreground", typeScale.meta)}
                  aria-live="polite"
                >
                  {closeNotesTrimmed.length}/1000 · mínimo 10 caracteres
                </p>
              </div>

              {closeError ? (
                <Callout variant="destructive" role="alert">
                  {closeError}
                </Callout>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={closeMutation.isPending}
                  onClick={() => setCloseDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <PrimaryButton type="submit" disabled={!canSubmitClose}>
                  {closeMutation.isPending ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  )}
                  Confirmar cierre
                </PrimaryButton>
              </div>
            </form>
          </DialogPopup>
        ) : null}
      </Dialog>

      {/* ── Confirmación de eliminación (S5) ── */}
      <RemoveAttachmentDialog
        open={attachmentToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setAttachmentToRemove(null);
        }}
        attachment={attachmentToRemove}
        requiresReason={reasonRequired}
        isSubmitting={removeMutation.isPending}
        errorMessage={removeError}
        onConfirm={(removedReason) => {
          if (!attachmentToRemove) return;
          removeMutation.mutate({
            attachmentId: attachmentToRemove.id,
            removedReason,
          });
        }}
      />
    </div>
  );
}
