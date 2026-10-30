"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useActiveContext } from "@/hooks/use-active-context";
import { vehicleApi } from "@/lib/api";
import { errorStatus } from "@/lib/api-error";
import { MEDIA_STALE_TIME } from "@/lib/constants";
import { activeConsignmentDealership } from "@/lib/consignment";
import { vehicleKeys } from "@/lib/query-keys";
import { VehicleHeader } from "@/components/vehicle/vehicle-header";
import { FichaCard } from "@/components/vehicle/ficha-card";
import { PhotosSection } from "@/components/vehicle/photos-section";
import { DocumentsSection } from "@/components/vehicle/documents-section";
import { MileageSection } from "@/components/vehicle/mileage-section";
import { HistorySection } from "@/components/vehicle/history-section";
import { VehicleDetailSkeleton } from "@/components/vehicle/vehicle-detail-skeleton";
import { TransferDialog } from "@/components/transfer/transfer-dialog";
import type { Vehicle } from "@/types/vehicle";

// ---------------------------------------------------------------------------
// Page — /vehicles/[id]
//
// Las secciones (Ficha / Kilometraje / Historial) viven en
// src/components/vehicle/*-section.tsx; Fotos y Documentos ya estaban
// extraídos. Este archivo concentra las 4 queries en paralelo (F-013 §5),
// los estados de carga/error (RF-6) y las acciones según rol/contexto.
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

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const activeContext = useActiveContext();
  const queryClient = useQueryClient();
  const [transferOpen, setTransferOpen] = useState(false);

  // F-013 §5: 3 llamadas en paralelo (edición también usa ["vehicle", id]).
  const vehicleQuery = useQuery({
    queryKey: vehicleKeys.detail(id),
    queryFn: () => vehicleApi.getVehicle(id),
    retry: false,
  });

  const photosQuery = useQuery({
    queryKey: [...vehicleKeys.detail(id), "photos"],
    queryFn: () => vehicleApi.listPhotos(id),
    retry: false,
    // URLs firmadas (~1 h en backend): 5 min evita refetch en cada mount.
    staleTime: MEDIA_STALE_TIME,
  });

  const documentsQuery = useQuery({
    queryKey: [...vehicleKeys.detail(id), "documents"],
    queryFn: () => vehicleApi.listDocuments(id),
    retry: false,
    // Idem photosQuery — URLs firmadas con expiración.
    staleTime: MEDIA_STALE_TIME,
  });

  // F-014 §5: 4ª llamada en paralelo (no bloquea la carga inicial del ficha).
  const historyQuery = useQuery({
    queryKey: [...vehicleKeys.detail(id), "history"],
    queryFn: () => vehicleApi.getVehicleHistory(id),
    retry: false,
  });

  // Loading: ficha aún no disponible → skeleton (no spinner centrado).
  if (vehicleQuery.isLoading) {
    return <VehicleDetailSkeleton />;
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
      {/* Hero */}
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
              <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
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
            queryKey: [...vehicleKeys.detail(vehicle.id), "photos"],
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
            queryKey: [...vehicleKeys.detail(vehicle.id), "documents"],
          })
        }
      />

      {/* Kilometraje (últimos 5 de GET /:id) */}
      <MileageSection vehicle={vehicle} canWrite={canRecordMileage} />

      {/* Historial (F-014 / D-052: merge cronológico de transfers, km y
          titularidad — mismo timeline que el dashboard) */}
      <HistorySection
        history={historyQuery.data}
        isLoading={historyQuery.isLoading}
        isError={historyQuery.isError}
        refetch={() =>
          queryClient.invalidateQueries({
            queryKey: [...vehicleKeys.detail(vehicle.id), "history"],
          })
        }
        vehicleId={vehicle.id}
      />
    </div>
  );
}
