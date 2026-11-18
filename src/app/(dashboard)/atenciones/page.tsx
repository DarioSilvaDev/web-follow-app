"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, RotateCw, Search, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, PageTitle, BackLink } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import { useDebounce } from "@/hooks/use-debounce";
import { careEpisodeApi } from "@/lib/api";
import { formatDate, formatDateOnly } from "@/lib/format-date";
import type { CareEpisodeListItem } from "@/types/care-episode";

// ---------------------------------------------------------------------------
// F-023 — "Atenciones" (listado del taller, contexto WORKSHOP).
// Journey de lectura: nav "Atenciones" → listado paginado de los CareEpisodes
// del taller del contexto (GET /care-episodes, workshop-scoped) → detalle en
// /vehicles/{vehicleId}/servicios/{servicioId}.
//
// WORKSHOP-only: sin taller seleccionado la página solo orienta (el backend
// responde 403 en PERSONAL — WorkshopOnly). Único filtro: patente vía `q`
// (D-F023-1a, enmienda de D-F023-1), sin PII del propietario por fila
// (D-F023-2), sin quick-action en dashboard (D-F023-4).
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;
const MIN_SEARCH_LENGTH = 2;

/**
 * Fecha canónica del item ya formateada (Plan 05 / F-TZ-5).
 *
 * Dos semánticas: si el backend expone `canonicalDateOnly` (fecha calendario
 * derivada de `serviceDate`) se formatea en UTC; si no (deploy viejo), se cae a
 * `canonicalDate` como instante en hora local. Ya NO se lee `serviceDate` crudo
 * del listado (D-070: el contrato no lo expone) — el fallback era código muerto.
 */
function episodeDate(item: CareEpisodeListItem): string {
  return item.canonicalDateOnly
    ? formatDateOnly(item.canonicalDateOnly)
    : formatDate(item.canonicalDate);
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

  // Búsqueda por patente (D-F023-1a): debounce + query efectiva ≥2 caracteres
  // tras trim; por debajo, `q` se omite (listado sin filtro). Escape y el
  // botón X pisan el input.
  const [searchInput, setSearchInput] = useState("");
  const debouncedInput = useDebounce(searchInput, DEBOUNCE_MS);
  const effectiveQ =
    debouncedInput.trim().length >= MIN_SEARCH_LENGTH
      ? debouncedInput.trim()
      : "";

  // Reset de página al cambiar de taller (patrón admin). Se hace durante el
  // render (patrón recomendado por React para "ajustar estado al cambiar una
  // prop") en lugar de en un useEffect, para evitar cascading renders y el
  // aviso de react-hooks/set-state-in-effect.
  const [trackedWorkshopId, setTrackedWorkshopId] = useState(workshopId);
  if (trackedWorkshopId !== workshopId) {
    setTrackedWorkshopId(workshopId);
    setPage(1);
  }

  // Reset de página al cambiar la query efectiva (misma idea, evita pedir
  // una página fuera de rango filtrada — el backend responde 200 vacío).
  const [trackedQ, setTrackedQ] = useState(effectiveQ);
  if (trackedQ !== effectiveQ) {
    setTrackedQ(effectiveQ);
    setPage(1);
  }

  const listQuery = useQuery({
    queryKey: ["care-episode-list", workshopId, page, effectiveQ],
    queryFn: () =>
      careEpisodeApi.listCareEpisodes({
        page,
        limit: PAGE_SIZE,
        ...(effectiveQ ? { q: effectiveQ } : {}),
      }),
    enabled: workshopId !== null,
    retry: false,
    placeholderData: keepPreviousData,
  });

  // Sin taller seleccionado: WORKSHOP-only por diseño (D-024 A2 / D-035).
  if (workshopId === null) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader back={<BackLink href="/dashboard">Volver al inicio</BackLink>}>
          <PageTitle title="Atenciones" />
        </PageHeader>
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
  const showSearchEmptyState = effectiveQ !== "" && items.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader back={<BackLink href="/dashboard">Volver al inicio</BackLink>}>
        <PageTitle
          title="Atenciones"
          description={`Atenciones registradas por ${workshopName ?? "tu taller"}`}
          actions={
            items.length > 0 || effectiveQ !== "" ? (
              <Link href="/atenciones/nueva">
                <Button className="min-h-11 px-5">
                  <Plus className="mr-1.5" aria-hidden="true" />
                  Registrar servicio
                </Button>
              </Link>
            ) : undefined
          }
        />
      </PageHeader>

      {/* Búsqueda por patente (D-F023-1a) — mismo patrón que /vehicles:
          input controlado + debounce, label sr-only, botón X para limpiar
          y Escape. Full-width en mobile, max-w-md en desktop. */}
      <div className="flex w-full max-w-md flex-col gap-2">
        <Label htmlFor="care-episode-search" className="sr-only">
          Buscar por patente
        </Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="care-episode-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchInput("");
            }}
            placeholder="Buscar por patente (ej. AAA111 o AA111AA)"
            maxLength={20}
            aria-describedby="care-episode-search-hint"
            className="h-11 rounded-xl border-input bg-card pl-11 pr-12 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-12"
          />
          {searchInput && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              // 36px visibles + área clickeable expandida a ~44px (WCAG 2.5.5).
              className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 after:absolute after:-inset-1 after:content-['']"
              aria-label="Limpiar búsqueda"
              onClick={() => setSearchInput("")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p id="care-episode-search-hint" className="text-xs text-muted-foreground">
            Patente vieja AAA111 · patente nueva AA111AA
          </p>
          {listQuery.isFetching && effectiveQ !== "" && (
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
              aria-label="Buscando…"
            />
          )}
        </div>
      </div>

      {/* Announcer sr-only: resultado del filtro para lectores de pantalla */}
      {meta && !listQuery.isFetching && (
        <p className="sr-only" role="status">
          {effectiveQ
            ? `${meta.total} ${meta.total === 1 ? "atención encontrada" : "atenciones encontradas"} con patente «${effectiveQ}»`
            : `${meta.total} ${meta.total === 1 ? "atención" : "atenciones"} registradas`}
        </p>
      )}

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
        showSearchEmptyState ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={Search}
                title="No se encontraron atenciones con esa patente"
                description={`No hay atenciones que coincidan con «${effectiveQ}». Probá con otra patente o limpiá la búsqueda.`}
                action={
                  <Button
                    variant="outline"
                    onClick={() => setSearchInput("")}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Limpiar búsqueda
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon={Wrench}
              title="Todavía no hay atenciones registradas"
              description="Cuando ingreses un vehículo o verifiques un servicio del propietario, vas a verlo acá."
              action={
                <Link href="/atenciones/nueva" className={buttonVariants()}>
                  Registrar servicio
                </Link>
              }
            />
          </CardContent>
        </Card>
        )
      ) : (
        <>
          <ul className="flex flex-col gap-4" aria-busy={listQuery.isFetching}>
            {items.map((item) => {
              return (
                <li key={item.id}>
                  <Link
                    href={`/vehicles/${item.vehicleId}/servicios/${item.id}`}
                    className="block rounded-card outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Card className="transition-colors hover:bg-muted/40 hover:ring-primary/40">
                      <CardContent className="grid gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold">
                            {displayTitle(item)}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={item.status} />
                            {item.source === "owner" && (
                              <StatusBadge
                                status={
                                  item.verification === "rejected"
                                    ? "rejected"
                                    : item.verification === "verified"
                                      ? "verified"
                                      : "unverified"
                                }
                              />
                            )}
                          </div>
                        </div>

                        <div className="grid gap-1 text-sm">
                          <p className="text-muted-foreground">
                            {episodeDate(item)}
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


