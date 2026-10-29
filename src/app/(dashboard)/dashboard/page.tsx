"use client";

/**
 * Dashboard — centro de control del vehículo (vehicle-first).
 *
 * Estructura (mobile-first 378px → desktop 1440px):
 * 1. Header del dashboard: saludo (secundario) + acción primaria contextual.
 * 2. Selector del vehículo ACTIVO (control principal) — persistencia vía
 *    searchParams `?v=<id>` (sin localStorage, regla del brief); sin `?v=`
 *    o con un id que no matchea ⇒ primer vehículo del listado.
 * 3. Hero del vehículo (datos de GET /:id + estado de la historia).
 * 4. Resumen de trazabilidad + últimos registros (GET /:id/history).
 * 5. Listado "Mis vehículos" (sección existente, conservada).
 *
 * Sin inventar datos: cada métrica sin backend muestra un estado vacío
 * explícito. Las queries reutilizan `vehicleKeys.detail(id)` → cache
 * compartida con la página de detalle (sin doble fetch).
 */

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Car, Loader2, Plus, RotateCw } from "lucide-react";
import { vehicleApi } from "@/lib/api";
import { vehicleKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { VehicleCard } from "@/components/vehicle/vehicle-card";
import { DashboardActions } from "@/components/dashboard/dashboard-actions";
import { VehicleSelector } from "@/components/dashboard/vehicle-selector";
import { VehicleHeroCard } from "@/components/dashboard/vehicle-hero-card";
import { TraceabilitySummaryCard } from "@/components/dashboard/traceability-summary-card";
import { VehicleTimelineCard } from "@/components/dashboard/vehicle-timeline-card";
import { useAuth } from "@/hooks/use-auth";
import { useActiveContext } from "@/hooks/use-active-context";
import type { SessionUser } from "@/types/auth";
import type { Vehicle } from "@/types/vehicle";

function isVehicleOwner(vehicle: Vehicle, userId: string | undefined): boolean {
  if (!userId) return false;
  return (
    vehicle.ownerships?.some(
      (o) => o.userId === userId && o.type === "owner" && !o.endsAt,
    ) ?? false
  );
}

function LoadingState() {
  return (
    <div
      className="flex items-center justify-center py-12"
      role="status"
      aria-label="Cargando"
    >
      <Loader2
        className="h-6 w-6 animate-spin text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

function HeroSkeleton() {
  return (
    <Card aria-hidden="true">
      <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 animate-pulse rounded-xl bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-48 animate-pulse rounded bg-muted" />
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="h-12 w-40 animate-pulse rounded bg-muted" />
        <div className="h-9 w-56 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

function QueryErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center py-6 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Reintentar
        </Button>
      </CardContent>
    </Card>
  );
}

function DashboardContent({ user }: { user: SessionUser }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeContext = useActiveContext();

  const vehicleQuery = useQuery({
    queryKey: vehicleKeys.dashboard(),
    queryFn: () => vehicleApi.listVehicles({ page: 1, limit: 10 }),
  });

  const vehicles = vehicleQuery.data?.data ?? [];

  // Vehículo activo: `?v=` si matchea el listado; si no, el primero.
  const requestedId = searchParams.get("v");
  const activeVehicle =
    vehicles.find((vehicle) => vehicle.id === requestedId) ??
    vehicles[0] ??
    null;
  const activeVehicleId = activeVehicle?.id ?? null;

  // Detalle + historial del vehículo activo — MISMAS claves que la página de
  // detalle (`vehicleKeys.detail`) → cache compartida, cero doble fetch.
  const detailQuery = useQuery({
    queryKey: vehicleKeys.detail(activeVehicleId ?? "none"),
    queryFn: () => vehicleApi.getVehicle(activeVehicleId as string),
    enabled: Boolean(activeVehicleId),
    retry: false,
  });

  const historyQuery = useQuery({
    queryKey: [...vehicleKeys.detail(activeVehicleId ?? "none"), "history"],
    queryFn: () => vehicleApi.getVehicleHistory(activeVehicleId as string),
    enabled: Boolean(activeVehicleId),
    retry: false,
  });

  const isWorkshop = activeContext?.type === "WORKSHOP";
  const isDealership = activeContext?.type === "DEALERSHIP";

  // "Registrar atención": taller (WORKSHOP) o titular en PERSONAL.
  // En DEALERSHIP no existe la acción → no se renderiza (no se inventa ruta).
  const detailVehicle = detailQuery.data ?? undefined;
  const isOwnerOfActive = detailVehicle
    ? isVehicleOwner(detailVehicle, user.id)
    : false;
  const registerCareHref = !activeVehicleId
    ? undefined
    : isWorkshop
      ? "/atenciones/nueva"
      : !isDealership && isOwnerOfActive
        ? `/vehicles/${activeVehicleId}/servicios/nueva`
        : undefined;

  const handleSelectVehicle = (vehicleId: string) => {
    router.replace(`/dashboard?v=${vehicleId}`, { scroll: false });
  };

  if (vehicleQuery.isLoading) {
    return <LoadingState />;
  }

  if (vehicleQuery.isError) {
    return (
      <QueryErrorCard
        message="No se pudieron cargar los vehículos."
        onRetry={() => vehicleQuery.refetch()}
      />
    );
  }

  const hasVehicles = vehicles.length > 0;

  const historyStatus: "loading" | "error" | "success" =
    historyQuery.isPending
      ? "loading"
      : historyQuery.isError
        ? "error"
        : "success";

  return (
    <div className="flex flex-col gap-6">
      {/* 1 — Header del dashboard: saludo secundario + acción primaria */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            Hola, {user.firstName || "Usuario"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasVehicles
              ? "Elegí un vehículo para ver su historia y trazabilidad."
              : "Empezá registrando tu primer vehículo."}
          </p>
        </div>
        <DashboardActions />
      </div>

      {!hasVehicles ? (
        /* Estado vacío: sin vehículos */
        <EmptyState
          icon={Car}
          title="Todavía no tenés vehículos"
          description="Agregá tu primer vehículo para empezar a construir su historia trazable."
          action={
            <Link href="/vehicles/new">
              <Button>
                <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Agregar mi primer vehículo
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* 2 — Selector del vehículo activo (control principal) */}
          <VehicleSelector
            vehicles={vehicles}
            activeVehicleId={activeVehicle?.id ?? null}
            onSelect={handleSelectVehicle}
            className="lg:max-w-xl"
          />

          {/* 3 — Hero del vehículo */}
          {!activeVehicleId ? null : detailQuery.isPending ? (
            <HeroSkeleton />
          ) : detailQuery.isError || !detailQuery.data ? (
            <QueryErrorCard
              message="No se pudo cargar la información del vehículo."
              onRetry={() => detailQuery.refetch()}
            />
          ) : (
            <VehicleHeroCard
              vehicle={detailQuery.data}
              careEpisodes={
                historyStatus === "success"
                  ? historyQuery.data?.careEpisodes
                  : undefined
              }
              registerCareHref={registerCareHref}
            />
          )}

          {/* 4 — Resumen de trazabilidad + últimos registros */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <TraceabilitySummaryCard
                vehicle={detailVehicle}
                vehicleId={activeVehicleId ?? ""}
                historyStatus={historyStatus}
                careEpisodes={
                  historyStatus === "success"
                    ? historyQuery.data?.careEpisodes
                    : undefined
                }
              />
            </div>
            <div className="lg:col-span-2">
              <VehicleTimelineCard
                vehicleId={activeVehicleId ?? ""}
                historyStatus={historyStatus}
                history={
                  historyStatus === "success" ? historyQuery.data : undefined
                }
                onRetry={() => historyQuery.refetch()}
                registerCareHref={registerCareHref}
              />
            </div>
          </div>

          {/* 5 — Listado de vehículos (sección existente) */}
          <section aria-labelledby="my-vehicles-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2
                id="my-vehicles-heading"
                className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Mis vehículos
              </h2>
              <Link
                href="/vehicles"
                className="text-sm font-medium text-primary hover:underline"
              >
                Ver todos
              </Link>
            </div>
            <ul className="flex flex-col gap-3">
              {vehicles.map((vehicle) => (
                <li key={vehicle.id}>
                  <VehicleCard
                    vehicle={vehicle}
                    isOwner={isVehicleOwner(vehicle, user.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { status, user } = useAuth();

  if (status === "loading") {
    return <LoadingState />;
  }

  if (!user) {
    return null;
  }

  // `useSearchParams` requiere un Suspense boundary (App Router).
  return (
    <Suspense fallback={<LoadingState />}>
      <DashboardContent user={user} />
    </Suspense>
  );
}
