"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Car, Plus, RotateCw, Search, X } from "lucide-react";
import { vehicleApi } from "@/lib/api";
import { vehicleKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { typeScale } from "@/components/ui/type-scale";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { VehicleCard } from "@/components/vehicle/vehicle-card";
import { useAuth } from "@/hooks/use-auth";
import { useDebounce } from "@/hooks/use-debounce";
import type { Vehicle } from "@/types/vehicle";

const PAGE = 1;
const LIMIT = 20;
const DEBOUNCE_MS = 300;
/** D-044 / RF-1: same normalization as backend — < 2 chars (after trim) → no filter. */
const MIN_SEARCH_LENGTH = 2;

/**
 * D-039 / RF-1: only the OWNER can edit. The list returns active ownerships
 * (endsAt === null) with `userId` y `type`. We match the ownership to the
 * CURRENT user id (not just any "owner" row) so a future co_owner/company
 * holder does not see the Edit button for the real owner's row.
 */
function isVehicleOwner(vehicle: Vehicle, userId: string | undefined): boolean {
  if (!userId) return false;
  return (
    vehicle.ownerships?.some(
      (o) => o.userId === userId && o.type === "owner" && !o.endsAt,
    ) ?? false
  );
}

export default function VehiclesPage() {
  const { user } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const debouncedInput = useDebounce(searchInput, DEBOUNCE_MS);
  const effectiveQ =
    debouncedInput.trim().length >= MIN_SEARCH_LENGTH
      ? debouncedInput.trim()
      : "";

  // F-012 / RF-4: clave estable y jerárquica (`vehicleKeys.all` la cubre)
  // + placeholderData keeps the previous list while q changes (no flash).
  const query = useQuery({
    queryKey: vehicleKeys.list({ page: PAGE, limit: LIMIT, q: effectiveQ }),
    queryFn: () =>
      effectiveQ
        ? vehicleApi.listVehicles({ page: PAGE, limit: LIMIT, q: effectiveQ })
        : vehicleApi.listVehicles({ page: PAGE, limit: LIMIT }),
    placeholderData: keepPreviousData,
  });

  const isEmpty = !query.data || query.data.data.length === 0;
  // Contador de la cabecera: `meta.total` (backend) y no `data.length`
  // (que queda en 20 por la página); con búsqueda activa refleja el total
  // filtrado, consistente con lo que se ve. Fallback defensivo a data.length.
  const qty = query.data?.meta?.total ?? query.data?.data?.length ?? 0;
  const showSearchEmptyState = Boolean(effectiveQ && isEmpty);

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera de pantalla: tarjeta clara (identidad Autentia, DS claro).
          Inspirada en la referencia conceptual de "Mis vehículos" (título +
          subtítulo + contador grande + acción primaria cuadrada), adaptada a
          nuestra paleta light (`--card`, `--border`, `--primary`). El contador
          en tabular-nums hace legible la cantidad de un vistazo; el botón es
          icon-only con nombre accesible vía aria-label. */}
      <header className="flex items-start justify-between gap-4 rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
        <div className="min-w-0">
          <h1
            className={`font-heading font-semibold tracking-tight text-foreground ${typeScale.display}`}
          >
            Mis vehículos
          </h1>
          <p className={`mt-1 text-muted-foreground ${typeScale.body}`}>
            Gestioná tus vehículos y sus historiales.
          </p>
          <p className="mt-3 flex items-baseline gap-2 sm:mt-4">
            <span className="font-heading text-4xl font-extrabold leading-none tracking-tight text-primary tabular-nums sm:text-5xl">
              {String(qty)}
            </span>
            <span
              className={`font-medium text-muted-foreground ${typeScale.body}`}
            >
              {qty === 1 ? "vehículo registrado" : "vehículos registrados"}
            </span>
          </p>
        </div>
        <Link
          href="/vehicles/new"
          aria-label="Registrar vehículo"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </Link>
      </header>

      {/* F-012 / RF-5: search bar — controlled input, accessible label, clear button. */}
      <div className="flex w-full max-w-md flex-col gap-2">
        <Label htmlFor="vehicle-search" className="sr-only">
          Buscar por patente
        </Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="vehicle-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por patente (ej. AAA111 o AA111AA)"
            maxLength={20}
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
        <p className="text-xs text-muted-foreground">
          Patente vieja AAA111 · patente nueva AA111AA
        </p>
      </div>

      {query.isLoading ? (
        // Skeleton con la forma de cada VehicleCard (no un spinner suelto).
        <ul
          className="flex flex-col gap-4"
          role="status"
          aria-label="Cargando vehículos"
        >
          {[0, 1, 2].map((row) => (
            <li
              key={row}
              aria-hidden="true"
              className="rounded-card border bg-card p-6 shadow-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
                  <div className="space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                  </div>
                </div>
                <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="mt-4 h-3 w-40 animate-pulse rounded bg-muted" />
            </li>
          ))}
        </ul>
      ) : query.isError ? (
        <EmptyState
          icon={RotateCw}
          title="No se pudieron cargar los vehículos"
          description="Ocurrió un error al consultar tus vehículos. Intentalo nuevamente."
          action={
            <Button variant="outline" onClick={() => query.refetch()}>
              <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              Reintentar
            </Button>
          }
        />
      ) : isEmpty ? (
        showSearchEmptyState ? (
          <EmptyState
            icon={Search}
            title="No se encontraron vehículos con esa patente"
            description={`No hay vehículos que coincidan con «${effectiveQ}». Probá con otra patente o limpiá la búsqueda.`}
            action={
              <Button variant="outline" onClick={() => setSearchInput("")}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Limpiar búsqueda
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Car}
            title="No tenés vehículos registrados"
            description="Registrá tu primer vehículo para empezar a construir su historia."
            action={
              <Link href="/vehicles/new">
                <Button>Registrar vehículo</Button>
              </Link>
            }
          />
        )
      ) : (
        <ul className="flex flex-col gap-4">
          {query.data.data.map((vehicle) => (
            <li key={vehicle.id}>
              <VehicleCard
                vehicle={vehicle}
                isOwner={isVehicleOwner(vehicle, user?.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
