"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Car,
  Gauge,
  Loader2,
  RotateCw,
  Store,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useActiveContext } from "@/hooks/use-active-context";
import { vehicleApi } from "@/lib/api";
import { errorStatus } from "@/lib/api-error";
import { MEDIA_STALE_TIME } from "@/lib/constants";
import { formatDateTime } from "@/lib/format-date";
import { activeConsignmentDealership } from "@/lib/consignment";
import { VehicleHeader } from "@/components/vehicle/vehicle-header";
import { PhotosSection } from "@/components/vehicle/photos-section";
import { DocumentsSection } from "@/components/vehicle/documents-section";
import { TransferDialog } from "@/components/transfer/transfer-dialog";
import {
  type TimelineEntry,
  mergeHistory,
  mileageSourceLabel,
} from "@/lib/vehicle-history";
import type { Vehicle } from "@/types/vehicle";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mismo mecanismo que el listado (D-039 / RF-1): owner = ownership activa
 *  (endsAt null) con type "owner" y userId = usuario actual. */
function isVehicleOwner(vehicle: Vehicle, userId: string | undefined): boolean {
  if (!userId) return false;
  return (
    vehicle.ownerships?.some(
      (o) => o.userId === userId && o.type === "owner" && !o.endsAt,
    ) ?? false
  );
}

/** F-014: fecha de timeline — dd/mm/yyyy (con hora si el timestamp la trae). */
function formatTimelineDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  // timestamptz: si trae hora distinta de medianoche, mostrarla.
  const timePart = iso.slice(11, 19);
  const hasTime =
    /^\d{2}:\d{2}:\d{2}$/.test(timePart) && timePart !== "00:00:00";
  if (hasTime) {
    return date.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const TIMELINE_TYPE_ICONS: Record<TimelineEntry["type"], React.ComponentType<{ className?: string }>> = {
  transfer: ArrowRightLeft,
  mileage: Gauge,
  ownership: Car,
  care: Wrench,
};

// ---------------------------------------------------------------------------
// Comisión: Cards verticales — Ficha / Fotos / Documentos / Kilometraje
// (Fotos y Documentos viven en src/components/vehicle/*-section.tsx)
// ---------------------------------------------------------------------------

function FichaCard({ vehicle }: { vehicle: Vehicle }) {
  // Milestone consignación (D-107): el titular ACTUAL puede ser persona
  // (type owner) o concesionaria (type company + dealership, titular
  // intermedio durante la exhibición). Se muestra el que esté vigente.
  const activeOwnership =
    vehicle.ownerships?.find((o) => !o.endsAt) ?? null;

  const ownerDisplayName = activeOwnership?.dealership?.name
    ? activeOwnership.dealership.name
    : activeOwnership?.user
      ? [activeOwnership.user.firstName, activeOwnership.user.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || "Propietario registrado"
      : "Propietario registrado";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ficha del vehículo</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground">Marca / modelo / versión</p>
          <p className="font-medium">
            {[vehicle.brand, vehicle.model, vehicle.version]
              .filter((part): part is string => Boolean(part && part.trim()))
              .join(" ") || "—"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Año</p>
          <p className="font-medium">
            {[vehicle.manufactureYear, vehicle.modelYear]
              .filter((year): year is number => typeof year === "number")
              .join(" / ") || "—"}
          </p>
        </div>
        {vehicle.color ? (
          <div>
            <p className="text-muted-foreground">Color</p>
            <p className="font-medium">{vehicle.color}</p>
          </div>
        ) : null}
        {vehicle.vin ? (
          <div>
            <p className="text-muted-foreground">VIN</p>
            <p className="font-medium">{vehicle.vin}</p>
          </div>
        ) : null}
        {vehicle.engineNumber ? (
          <div>
            <p className="text-muted-foreground">Número de motor</p>
            <p className="font-medium">{vehicle.engineNumber}</p>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <p className="text-muted-foreground">Notas</p>
          <p className="font-medium whitespace-pre-wrap">
            {vehicle.notes?.trim() || "—"}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-muted-foreground">Titular actual</p>
          {/* RF-2: sin exposición de PII innecesaria — solo nombre/apellido
              (el email lo controla el backend y NO se muestra). */}
          <p className="font-medium">{ownerDisplayName}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function MileageSection({
  vehicle,
  canWrite,
}: {
  vehicle: Vehicle;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [km, setKm] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const record = useMutation({
    mutationFn: (dto: { mileage: number; notes?: string }) =>
      vehicleApi.recordMileage(vehicle.id, dto),
    onSuccess: () => {
      setKm("");
      setNotes("");
      setFormError(null);
      // GET /:id incluye los últimos 5 km — invalidar con el prefijo del vehículo.
      queryClient.invalidateQueries({ queryKey: ["vehicle", vehicle.id] });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = Number(km);
    if (!km.trim() || Number.isNaN(parsed) || parsed < 0) {
      setFormError("Ingresá un kilometraje válido.");
      return;
    }
    // D-11 (Gap 1): el payload es { mileage, notes? } — el backend deriva
    // source/recordedBy del contexto activo (concesionaria u dueño).
    record.mutate(
      { mileage: Math.round(parsed), notes: notes.trim() || undefined },
      {
        onError: (error) => {
          const status = errorStatus(error);
          if (status === 400 || status === 409) {
            setFormError(
              "El kilometraje debe ser mayor o igual al último registrado (RF-5).",
            );
          } else if (status === 403) {
            setFormError("No tenés permiso para registrar kilometraje.");
          } else {
            setFormError("No se pudo registrar el kilometraje. Intentalo nuevamente.");
          }
        },
      },
    );
  };

  const mileages = vehicle.mileages ?? [];
  // D-11 (Gap 1): distinguir "sin registros" (mileageCount 0) de "hay registros
  // pero los últimos no vinieron" — y garantizar que un registro de 0 km se
  // renderice (no colapsa a estado vacío).
  const totalCount = vehicle.mileageCount ?? mileages.length;
  const hasAnyRecord = totalCount > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kilometraje</CardTitle>
        <CardDescription>
          {hasAnyRecord
            ? "Últimos registros de kilometraje."
            : "Registrá el kilometraje para mantener la historia del vehículo."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mileages.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            {hasAnyRecord
              ? "No se pudieron cargar los últimos registros."
              : "Todavía no hay registros de kilometraje."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mileages.map((mileage) => (
              <li
                key={mileage.id}
                className="flex items-baseline justify-between gap-3 rounded-lg ring-1 ring-foreground/10 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {mileage.mileage.toLocaleString("es-AR")} km
                  </p>
                  {mileage.notes ? (
                    <p className="text-muted-foreground text-xs">
                      {mileage.notes}
                    </p>
                  ) : null}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>
                    {mileage.recordedBy?.displayName ??
                      mileageSourceLabel(mileage.source)}
                  </p>
                  <p>{formatDateTime(mileage.recordedAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {canWrite && (
          <form
            className="grid gap-3 rounded-lg ring-1 ring-foreground/10 p-3"
            onSubmit={handleSubmit}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="mileage-km">Kilometraje (km)</Label>
              <Input
                id="mileage-km"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="Ej. 25000"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mileage-notes">Notas (opcional)</Label>
              <Textarea
                id="mileage-notes"
                rows={2}
                placeholder="Ej. Cambio de aceite realizado"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={record.isPending}
            >
              {record.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                "Registrar km"
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// F-014 + 2-3: Historial — merge cronológico de transfers + mileages +
//              ownerships + care episodes (D-052 / D-069..D-071)
// ---------------------------------------------------------------------------

function HistorySection({
  entries,
  isLoading,
  isError,
  refetch,
  vehicleId,
}: {
  entries: TimelineEntry[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  vehicleId: string;
}) {
  /** Contenido interno de una entrada (icono + datos). Reutilizado por el
   *  deep-link de care y por las entradas no-enlazables. */
  const renderEntryBody = (entry: TimelineEntry) => (
    <>
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
        {(() => {
          const Icon = TIMELINE_TYPE_ICONS[entry.type];
          return <Icon className="h-3.5 w-3.5 text-muted-foreground" />;
        })()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="font-medium">{entry.title}</p>
          <p className="text-xs text-muted-foreground">
            {formatTimelineDate(entry.date)}
          </p>
        </div>
        {entry.actor ? (
          <p className="text-xs text-muted-foreground">{entry.actor}</p>
        ) : null}
        {entry.badge ? (
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">
            {entry.badge}
          </p>
        ) : null}
        {entry.notes ? (
          <p className="mt-1 text-xs text-muted-foreground/80">{entry.notes}</p>
        ) : null}
      </div>
    </>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial</CardTitle>
        <CardDescription>
          {entries.length > 0
            ? "Del más reciente al más antiguo."
            : "Atenciones, transferencias, kilometraje y cambios de propiedad."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <div
            role="status"
            aria-label="Cargando historial"
            className="flex justify-center py-6"
          >
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No se pudo cargar el historial.
            </p>
            <Button variant="outline" size="sm" onClick={refetch}>
              <RotateCw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Sin eventos registrados
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {entries.map((entry) =>
              entry.type === "care" && entry.careId ? (
                <li
                  key={entry.id}
                  className="rounded-lg ring-1 ring-foreground/10"
                >
                  {/* Iteración 2-4: deep-link al detalle del servicio. Ancla
                      nativa (next/link) → accesible por teclado / botón medio. */}
                  <Link
                    href={`/vehicles/${vehicleId}/servicios/${entry.careId}`}
                    aria-label={`Ver detalle de ${entry.title}`}
                    className="flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {renderEntryBody(entry)}
                  </Link>
                </li>
              ) : (
                <li
                  key={entry.id}
                  className="flex items-start gap-3 rounded-lg ring-1 ring-foreground/10 px-3 py-2 text-sm"
                >
                  {renderEntryBody(entry)}
                </li>
              ),
            )}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const activeContext = useActiveContext();
  const queryClient = useQueryClient();
  const [transferOpen, setTransferOpen] = useState(false);

  // F-013 §5: 3 llamadas en paralelo (edición también usa ["vehicle", id]).
  const vehicleQuery = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => vehicleApi.getVehicle(id),
    retry: false,
  });

  const photosQuery = useQuery({
    queryKey: ["vehicle", id, "photos"],
    queryFn: () => vehicleApi.listPhotos(id),
    retry: false,
    // URLs firmadas (~1 h en backend): 5 min evita refetch en cada mount.
    staleTime: MEDIA_STALE_TIME,
  });

  const documentsQuery = useQuery({
    queryKey: ["vehicle", id, "documents"],
    queryFn: () => vehicleApi.listDocuments(id),
    retry: false,
    // Idem photosQuery — URLs firmadas con expiración.
    staleTime: MEDIA_STALE_TIME,
  });

  // F-014 §5: 4ª llamada en paralelo (no bloquea la carga inicial del ficha).
  const historyQuery = useQuery({
    queryKey: ["vehicle", id, "history"],
    queryFn: () => vehicleApi.getVehicleHistory(id),
    retry: false,
  });

  // Loading: ficha aún no disponible.
  if (vehicleQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // RF-6: errores de carga del vehículo (404 / 403 / genérico).
  if (vehicleQuery.isError || !vehicleQuery.data) {
    const status = errorStatus(vehicleQuery.error);
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <Card>
          <CardContent className="py-8 text-center">
            {status === 404 ? (
              <>
                <p className="text-lg font-semibold">Vehículo no encontrado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  El vehículo que buscás no existe o fue eliminado.
                </p>
              </>
            ) : status === 403 ? (
              <>
                <p className="text-lg font-semibold">Acceso denegado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No tenés permiso para ver este vehículo.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">
                  No se pudo cargar el vehículo
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ocurrió un error al consultar el vehículo. Intentalo
                  nuevamente.
                </p>
              </>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/vehicles">
                <Button variant="outline">Volver a mis vehículos</Button>
              </Link>
              {status !== 404 && status !== 403 && (
                <Button onClick={() => vehicleQuery.refetch()}>Reintentar</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const vehicle = vehicleQuery.data;
  const isOwner = isVehicleOwner(vehicle, user?.id);

  // D-12 (Gap 1): el backend calcula las capacidades para ESTE usuario y
  // contexto activo (ownership ≠ access; una concesionaria puede editar sin
  // ser "owner"). CONTRACT TOLERANCE: mientras un backend previo no envíe
  // `capabilities`, se cae al comportamiento anterior basado en ownership.
  const canEdit = vehicle.capabilities?.canEdit ?? isOwner;
  const canRecordMileage = vehicle.capabilities?.canRecordMileage ?? isOwner;

  // Milestone consignación (D-107/RB-09): durante la exhibición la dealership
  // es titular intermedio. El banner se muestra a QUIEN NO PUEDE EDITAR
  // (lectores); el miembro titular ve la ficha normal (D-TL-12).
  const consignmentDealership = activeConsignmentDealership(vehicle);
  const showConsignmentBanner = !!consignmentDealership && !canEdit;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <VehicleHeader
        vehicle={vehicle}
        canEdit={canEdit}
        showSharedBadge={!isOwner}
      />

      {/* Banner de consignación (D-107): visible para quien lee el vehículo
          mientras la concesionaria es titular intermedio. */}
      {showConsignmentBanner && consignmentDealership && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
        >
          <Store className="h-4 w-4 shrink-0 text-primary" />
          <p>
            En consignación en{" "}
            <span className="font-semibold">
              {consignmentDealership.name}
            </span>
            . Durante la exhibición, fotos, documentos y kilometraje no se
            pueden modificar.
          </p>
        </div>
      )}

      {/* Acciones específicas del contexto */}
      <div className="flex flex-wrap gap-2">
        {/* Iteración 2-2 / RF-8: "Registrar servicio" solo para el owner en
            contexto PERSONAL (null). Con taller seleccionado (WORKSHOP) el
            owner ve el flujo del taller. */}
        {isOwner && activeContext === null && (
          <>
            <Link href={`/vehicles/${vehicle.id}/servicios/nueva`}>
              <Button variant="outline" size="sm">
                Registrar servicio
              </Button>
            </Link>
            {/* Fase 1 / D-078: CTA de transferencia — owner + contexto PERSONAL
                (un taller activo devolvería 403 en el flujo de propietario). */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTransferOpen(true)}
            >
              <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
              Transferir
            </Button>
            <TransferDialog
              open={transferOpen}
              onOpenChange={setTransferOpen}
              vehicle={{
                id: vehicle.id,
                licensePlate: vehicle.licensePlate,
              }}
            />
          </>
        )}
      </div>

      {/* Ficha (progressive: apenas llega GET /:id) */}
      <FichaCard vehicle={vehicle} />

      {/* Fotos (signed URLs batch ?signed=true + visor full-screen) */}
      <PhotosSection
        vehicleId={vehicle.id}
        canWrite={canEdit}
        photos={photosQuery.data ?? []}
        isLoading={photosQuery.isLoading}
        isError={photosQuery.isError}
        refetch={() =>
          queryClient.invalidateQueries({
            queryKey: ["vehicle", vehicle.id, "photos"],
          })
        }
      />

      {/* Documentos (signed URLs batch ?signed=true + preview PDF/imagen) */}
      <DocumentsSection
        vehicleId={vehicle.id}
        canWrite={canEdit}
        documents={documentsQuery.data ?? []}
        isLoading={documentsQuery.isLoading}
        isError={documentsQuery.isError}
        refetch={() =>
          queryClient.invalidateQueries({
            queryKey: ["vehicle", vehicle.id, "documents"],
          })
        }
      />

      {/* Kilometraje (últimos 5 de GET /:id) */}
      <MileageSection vehicle={vehicle} canWrite={canRecordMileage} />

      {/* Historial (F-014 / D-052: merge cronológico de transfers, km y titularidad) */}
      <HistorySection
        entries={
          historyQuery.data ? mergeHistory(historyQuery.data) : []
        }
        isLoading={historyQuery.isLoading}
        isError={historyQuery.isError}
        refetch={() =>
          queryClient.invalidateQueries({
            queryKey: ["vehicle", vehicle.id, "history"],
          })
        }
        vehicleId={vehicle.id}
      />
    </div>
  );
}
