"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, RotateCw, Search, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { CareEpisodeTable } from "@/components/care-episode/care-episode-table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, PageTitle } from "@/components/ui/page-header";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import { useDebounce } from "@/hooks/use-debounce";
import { careEpisodeApi } from "@/lib/api";
import { MEDIA_STALE_TIME } from "@/lib/constants";
import { formatLicensePlateInput } from "@/lib/license-plate";

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

export default function AtencionesPage() {
  const activeContext = useActiveContext();
  const workshopId =
    activeContext?.type === "WORKSHOP" ? activeContext.workshopId : null;
  const { status, user } = useAuth();
  const router = useRouter();

  const workshopName = user?.workshopMemberships.find(
    (membership) => membership.workshopId === workshopId,
  )?.workshop.name;

  const hasWorkshopMembership = (user?.workshopMemberships?.length ?? 0) > 0;

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
        // D-213: la tabla comparte con el resumen del taller la miniatura
        // firmada del vehículo (opt-in, sin request extra por fila).
        signed: true,
      }),
    enabled: workshopId !== null,
    retry: false,
    placeholderData: keepPreviousData,
    // Las URLs firmadas vencen en ~1 h: refetch preventivo como en el widget.
    refetchInterval: MEDIA_STALE_TIME,
  });

  // Sin taller seleccionado: WORKSHOP-only por diseño (D-024 A2 / D-035).
  if (workshopId === null) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader>
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {/* Sin BackLink: "Inicio" ya está en el drawer mobile y en el sidebar
          desktop, y además /dashboard NO limpia el contexto WORKSHOP (ver
          layout del shell), así que el link era redundante y engañoso. */}
      <PageHeader className="rounded-card bg-secondary/40 p-page md:bg-transparent md:p-0">
        <PageTitle
          title="Atenciones"
          description={`Atenciones registradas por ${workshopName ?? "tu taller"}`}
          actions={
            items.length > 0 || effectiveQ !== "" ? (
              <Link href="/atenciones/nueva" className="w-full sm:w-auto">
                <Button className="min-h-11 w-full justify-center px-5">
                  <Plus className="mr-1.5" aria-hidden="true" />
                  Registrar servicio
                </Button>
              </Link>
            ) : undefined
          }
        />
      </PageHeader>

      {/* Búsqueda por patente (D-F023-1a): input controlado + debounce, label
          sr-only y UN solo botón X para limpiar (se oculta el nativo que el
          navegador agrega a type="search"). La patente se formatea mientras se
          escribe con la misma regla de registro: 2 letras obligatorias y el
          3.er carácter define AAA111 (letra) o AA111AA (dígito). */}
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
            onChange={(e) =>
              setSearchInput(formatLicensePlateInput(e.target.value))
            }
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchInput("");
            }}
            placeholder="Ej. AAA111 o AA111AA"
            maxLength={7}
            className="h-11 rounded-xl border-input bg-card pl-11 pr-12 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none sm:h-12"
          />
          {listQuery.isFetching && effectiveQ !== "" && (
            <Loader2
              className="absolute right-12 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none"
              aria-label="Buscando…"
            />
          )}
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
                  <Button variant="outline" onClick={() => setSearchInput("")}>
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
          <CareEpisodeTable
            items={items}
            showDetails
            isFetching={listQuery.isFetching}
          />

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
