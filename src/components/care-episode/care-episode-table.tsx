"use client";

/**
 * Template ÚNICO del listado de atenciones del taller (F-023).
 *
 * Lo usan `/atenciones` (listado completo, "Ver todas") y la tarjeta
 * "Atenciones recientes" del resumen del taller, para que ambos journey
 * muestren exactamente la misma información: Vehículo / Servicio / Estado / Fecha.
 *
 * Mobile (< md): cada fila es una card de 3 zonas (identidad + fecha, servicio +
 * km, acción + estado), inspirada en el mockup de "Atenciones". El wrapper de
 * identidad + fecha usa `md:contents`: en desktop desaparece y sus hijos pasan a
 * ser items del grid, recuperando el orden original con `order-*`.
 *
 * Desktop (md+): se conserva el grid de 4 columnas con `minmax(0, …)`: con
 * columnas `auto` cada celda se dimensionaba por su contenido (badge/fecha
 * distintos) y el header no coincidía con las filas; además evita que textos
 * largos rompan el layout en pantallas estrechas.
 *
 * Accesibilidad: UNA sola parada de Tab por fila (toda la card es un `<Link>`);
 * "Ver detalle" es un `<span>` decorativo dentro del link, no un botón anidado.
 * El estado nunca depende del color (icono + texto en `StatusBadge`).
 *
 * Sin PII del propietario: el contrato del listado ya viene acotado (D-F023-2).
 */

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CarFront,
  ChevronRight,
  Clock3,
  Eye,
  Gauge,
} from "lucide-react";
import { cn } from "cn";
import { StatusBadge } from "@/components/ui/status-badge";
import { SIGNED_URL_REFRESH_THRESHOLD_MS } from "@/lib/constants";
import { formatDate, formatDateOnly } from "@/lib/format-date";
import type { CareEpisodeListItem } from "@/types/care-episode";

const ROW_GRID =
  "md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.35fr)_minmax(0,0.95fr)_minmax(0,0.8fr)]";

/** Fecha canónica del item (misma semántica en widget y listado). */
function episodeDate(item: CareEpisodeListItem): string {
  return item.canonicalDateOnly
    ? formatDateOnly(item.canonicalDateOnly)
    : formatDate(item.canonicalDate);
}

/** Título con fallback (D-071). */
function displayTitle(item: CareEpisodeListItem): string {
  const base =
    item.title ??
    (item.source === "workshop" ? "Atención de taller" : "Servicio registrado");
  return item.status === "cancelled" ? `${base} (cancelada)` : base;
}

/** Resumen del vehículo (marca modelo · año). */
function vehicleSummary(item: CareEpisodeListItem): string {
  const catalog = [item.vehicle.brand, item.vehicle.model]
    .filter(Boolean)
    .join(" ");
  const year = item.vehicle.manufactureYear ?? null;
  return [catalog, year].filter(Boolean).join(" · ") || "Sin datos de catálogo";
}

type PrimaryPhoto = NonNullable<CareEpisodeListItem["vehicle"]["primaryPhoto"]>;

/**
 * D-213: la URL firmada ya viene en el item del listado (`?signed=true`).
 * NO se pide `GET /vehicles/:id/photos`: en contexto WORKSHOP devuelve 403
 * (D-024 A1.4) y además costaba una request por fila.
 */
function isPhotoFresh(
  photo: PrimaryPhoto | null | undefined,
): photo is PrimaryPhoto {
  if (!photo?.url || !photo.expiresAt) return false;
  const expiresAt = Date.parse(photo.expiresAt);
  return (
    !Number.isNaN(expiresAt) &&
    Date.now() < expiresAt - SIGNED_URL_REFRESH_THRESHOLD_MS
  );
}

/**
 * Miniatura con fallback al icono de auto cuando no hay foto, la URL está por
 * vencer o la imagen falla (404/403). Recuerda la URL fallida para no
 * reintentarla en cada render hasta que llegue una nueva.
 *
 * `alt=""`: la identidad del vehículo ya está en el texto adyacente, así el
 * link de la fila no duplica información para lectores de pantalla.
 */
function VehicleThumbnail({
  photo,
}: {
  photo: PrimaryPhoto | null | undefined;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = isPhotoFresh(photo) && failedUrl !== photo.url ? photo.url : null;

  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-muted text-muted-foreground sm:size-12 md:h-8 md:w-10">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <CarFront className="size-5 md:size-4" aria-hidden="true" />
      )}
    </span>
  );
}

/** Badge de verificación del episodio `source='owner'` (D-064/D-209). */
function VerificationBadge({ item }: { item: CareEpisodeListItem }) {
  if (item.source !== "owner") return null;

  return (
    <StatusBadge
      status={
        item.verification === "rejected"
          ? "rejected"
          : item.verification === "verified"
            ? "verified"
            : "unverified"
      }
    />
  );
}

export interface CareEpisodeTableProps {
  items: CareEpisodeListItem[];
  /** Listado completo: muestra verificación y km además de las 4 columnas. */
  showDetails?: boolean;
  isFetching?: boolean;
}

export function CareEpisodeTable({
  items,
  showDetails = false,
  isFetching = false,
}: CareEpisodeTableProps) {
  return (
    <div
      className="md:overflow-hidden md:rounded-lg md:border md:border-border"
      aria-busy={isFetching}
    >
      {/* Encabezados: solo desktop. En mobile cada fila se apila en 3 zonas. */}
      <div
        aria-hidden="true"
        className={cn(
          "hidden gap-3 bg-muted/40 px-3 py-2 text-[11px] font-medium text-muted-foreground md:grid",
          ROW_GRID,
        )}
      >
        <span>Vehículo</span>
        <span>Servicio</span>
        <span>Estado</span>
        <span>Fecha</span>
      </div>
      <ul className="flex flex-col gap-card-gap md:block md:divide-y md:divide-border">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-card border border-border bg-card shadow-card md:rounded-none md:border-0 md:shadow-none"
          >
            <Link
              href={`/vehicles/${item.vehicleId}/servicios/${item.id}`}
              className={cn(
                "flex flex-col gap-2 px-3 py-3 text-xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid md:items-center md:gap-3 md:py-2.5",
                ROW_GRID,
              )}
            >
              {/* Zona 1 — mobile: identidad a la izquierda, fecha a la derecha.
                  Desktop: `contents` + `order-*` devuelve cada bloque a su
                  columna original (1 y 4) del grid. */}
              <div className="flex items-center justify-between gap-2 md:contents">
                <div className="flex min-w-0 items-center gap-2 md:order-1">
                  <VehicleThumbnail photo={item.vehicle.primaryPhoto} />
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {item.vehicle.licensePlate}
                    </span>
                    <span className="block truncate text-muted-foreground">
                      {vehicleSummary(item)}
                    </span>
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 md:order-4 md:justify-end">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 px-2.5 py-1 text-xs font-medium text-secondary-foreground md:bg-transparent md:px-0 md:py-0 md:font-normal md:text-muted-foreground">
                    <CalendarDays
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {episodeDate(item)}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
              </div>

              {/* Zona 2 — servicio y kilometraje (Gauge, nunca MapPin). */}
              <div className="flex min-w-0 items-center gap-2 border-t border-border/60 pt-2 md:order-2 md:block md:border-t-0 md:pt-0">
                <p className="flex min-w-0 items-center gap-1.5 truncate text-foreground">
                  <Clock3
                    className="size-3.5 shrink-0 text-muted-foreground md:hidden"
                    aria-hidden="true"
                  />
                  {displayTitle(item)}
                </p>
                {showDetails && item.mileageIn != null && (
                  <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-muted-foreground md:mt-0.5 md:block">
                    <Gauge
                      className="size-3.5 shrink-0 md:hidden"
                      aria-hidden="true"
                    />
                    {item.mileageIn.toLocaleString("es-AR")} km
                  </span>
                )}
              </div>

              {/* Zona 3 — acción visual + estado y verificación. El "Ver detalle"
                  es un span: la fila entera ya es el link (una sola parada Tab). */}
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 md:order-3 md:flex-col md:items-start md:border-t-0 md:pt-0">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-primary md:hidden">
                  <Eye className="size-3.5 shrink-0" aria-hidden="true" />
                  Ver detalle
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5 md:ml-0">
                  <StatusBadge status={item.status} />
                  {showDetails && <VerificationBadge item={item} />}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
