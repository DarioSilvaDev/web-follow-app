"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RotateCw, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import { careEpisodeApi } from "@/lib/api";
import type { CareEpisodeListItem } from "@/types/care-episode";

// ---------------------------------------------------------------------------
// F-023 — "Atenciones" (listado del taller, contexto WORKSHOP).
// Journey de lectura: nav "Atenciones" → listado paginado de los CareEpisodes
// del taller del contexto (GET /care-episodes, workshop-scoped) → detalle en
// /vehicles/{vehicleId}/servicios/{servicioId}.
//
// WORKSHOP-only: sin taller seleccionado la página solo orienta (el backend
// responde 403 en PERSONAL — WorkshopOnly). Sin filtros (D-F023-1), sin PII
// del propietario por fila (D-F023-2), sin quick-action en dashboard
// (D-F023-4).
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

/** Copia local del mapa de estados del detalle (RF-5, copy existente). */
const STATUS_LABELS: Record<
  CareEpisodeListItem["status"],
  { label: string; variant: BadgeVariant }
> = {
  open: { label: "Abierto", variant: "info" },
  delivered: { label: "Entregado", variant: "success" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Fecha canónica del item: el backend pre-computa `canonicalDate` (D-070) y
 * siempre está presente; el coalesce en cliente es un fallback defensivo si
 * el contrato expusiera los campos crudos.
 */
function episodeDate(item: CareEpisodeListItem): string {
  const raw = item as CareEpisodeListItem & {
    serviceDate?: string | null;
    checkedInAt?: string | null;
    createdAt?: string | null;
  };
  return (
    raw.canonicalDate ??
    raw.serviceDate ??
    raw.checkedInAt ??
    raw.createdAt ??
    ""
  );
}

/** Título con fallback D-071 (copia local de la lógica del timeline). */
function displayTitle(item: CareEpisodeListItem): string {
  const baseTitle =
    item.title ??
    (item.source === "workshop"
      ? "Atención de taller"
      : "Servicio registrado");
  return item.status === "cancelled" ? `${baseTitle} (cancelada)` : baseTitle;
}

/** Resumen del vehículo (marca modelo · año) — espejo de verificaciones, sin `version` (RF-4). */
function vehicleSummary(item: CareEpisodeListItem): string {
  const catalog = [item.vehicle.brand, item.vehicle.model]
    .filter(Boolean)
    .join(" ");
  const year = item.vehicle.manufactureYear ?? null;
  return [catalog, year].filter(Boolean).join(" · ") || "Sin datos de catálogo";
}

export default function AtencionesPage() {
  const activeContext = useActiveContext();
  const workshopId =
    activeContext?.type === "WORKSHOP" ? activeContext.workshopId : null;
  const { status, user } = useAuth();
  const router = useRouter();

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

  const [page, setPage] = useState(1);

  // Reset de página al cambiar de taller (patrón admin).
  useEffect(() => {
    setPage(1);
  }, [workshopId]);

  const listQuery = useQuery({
    queryKey: ["care-episode-list", workshopId, page],
    queryFn: () => careEpisodeApi.listCareEpisodes({ page, limit: PAGE_SIZE }),
    enabled: workshopId !== null,
    retry: false,
  });

  // Sin taller seleccionado: WORKSHOP-only por diseño (D-024 A2 / D-035).
  if (workshopId === null) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <Heading />
        <Card>
          <CardContent>
            <p role="status" className="text-sm text-muted-foreground">
              Para ver las atenciones de tu taller necesitás operar en el
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

  const items = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Heading workshopName={workshopName} />

      {listQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground" role="status">
              Cargando atenciones…
            </p>
          </CardContent>
        </Card>
      ) : listQuery.isError ? (
        <Card>
          <CardContent className="grid gap-3 py-6 text-center">
            <p className="text-sm text-destructive" role="alert">
              No se pudieron cargar las atenciones.
            </p>
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void listQuery.refetch()}
              >
                <RotateCw className="h-3.5 w-3.5" />
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Wrench}
              title="Todavía no hay atenciones registradas"
              description="Cuando ingreses un vehículo o verifiques un servicio del propietario, vas a verlo acá."
              action={
                <Link href="/atenciones/nueva" className={buttonVariants()}>
                  Registrar atención
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <ul className="flex flex-col gap-4" aria-busy={listQuery.isFetching}>
            {items.map((item) => {
              const statusLabel = STATUS_LABELS[item.status];
              return (
                <li key={item.id}>
                  <Link
                    href={`/vehicles/${item.vehicleId}/servicios/${item.id}`}
                    className="block rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Card className="transition-colors hover:bg-muted/40 hover:ring-primary/40">
                      <CardContent className="grid gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold">
                            {displayTitle(item)}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={statusLabel.variant}>
                              {statusLabel.label}
                            </Badge>
                            {item.source === "owner" && (
                              <Badge
                                variant={
                                  item.verification === "verified"
                                    ? "outline"
                                    : "secondary"
                                }
                              >
                                {item.verification === "verified"
                                  ? "Verificado"
                                  : "Registrado por el propietario"}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-1 text-sm">
                          <p className="text-muted-foreground">
                            {formatDate(episodeDate(item))}
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
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>

          {meta && meta.totalPages > 1 && (
            <Card className="py-0">
              <AdminTablePagination
                page={meta.page}
                totalPages={meta.totalPages}
                total={meta.total}
                isFetching={listQuery.isFetching}
                onPageChange={setPage}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Heading({ workshopName }: { workshopName?: string }) {
  return (
    <div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver al inicio
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Atenciones</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Atenciones registradas por {workshopName ?? "tu taller"}
      </p>
    </div>
  );
}
