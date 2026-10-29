"use client";

/**
 * Resumen de trazabilidad del vehículo activo (antes planteado como "salud").
 *
 * Decisión de producto: se llama TRAZABILIDAD, no "salud" — el backend hoy no
 * entrega métricas de salud ni "próximo mantenimiento", y no se inventan
 * datos. Cada fila muestra el dato real o un estado vacío explícito.
 *
 * Datos reales usados (endpoints existentes):
 * - `GET /vehicles/:id`  → documents (con expiresAt), mileageCount.
 * - `GET /vehicles/:id/history` → careEpisodes (última atención, verificación).
 */

import Link from "next/link";
import { ArrowRight, Check, FileText, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/format-date";
import { cn } from "cn";
import type { Vehicle, VehicleCareEpisode } from "@/types/vehicle";

interface TraceabilitySummaryCardProps {
  /**
   * Vehículo del DETALLE (GET /:id). `undefined` = aún no cargado → las
   * filas que dependen del detalle muestran "…" (nunca 0 falsos).
   */
  vehicle?: Vehicle;
  /** Id para los links al detalle (disponible desde el listado). */
  vehicleId: string;
  /** Estado de la query del historial (los episodios vienen de ahí). */
  historyStatus: "loading" | "error" | "success";
  /** Solo presente con `historyStatus === "success"`. */
  careEpisodes?: VehicleCareEpisode[];
}

interface MetricRow {
  label: string;
  value: string;
  detail?: React.ReactNode;
}

/** Registrante de una atención — TALLER es registrante, no propietario. */
function careRegistrant(episode: VehicleCareEpisode): string {
  const workshopName = episode.workshopName ?? episode.workshop?.name;
  if (episode.source === "workshop" && workshopName) {
    return `Registrado por ${workshopName}`;
  }
  if (episode.verification === "verified" && workshopName) {
    return `Verificado por ${workshopName}`;
  }
  return "Registrado por el propietario";
}

function ChecklistItem({
  done,
  doneLabel,
  pendingLabel,
}: {
  done: boolean | undefined;
  doneLabel: string;
  pendingLabel: string;
}) {
  const label = done === undefined ? "…" : done ? doneLabel : pendingLabel;
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        aria-hidden="true"
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          done === undefined
            ? "bg-muted"
            : done
              ? "bg-success/15 text-success"
              : "bg-warning/15 text-warning",
        )}
      >
        {done === undefined ? (
          <Minus className="h-3 w-3" />
        ) : done ? (
          <Check className="h-3 w-3" />
        ) : (
          <Minus className="h-3 w-3" />
        )}
      </span>
      <span className={cn(done === undefined && "text-muted-foreground")}>
        {label}
      </span>
    </li>
  );
}

export function TraceabilitySummaryCard({
  vehicle,
  vehicleId,
  historyStatus,
  careEpisodes,
}: TraceabilitySummaryCardProps) {
  const isLoading = historyStatus === "loading";
  const isError = historyStatus === "error";
  const episodes = historyStatus === "success" ? careEpisodes ?? [] : [];

  const latestCare = episodes[0];
  const hasCare = episodes.length > 0;
  // `detailLoaded`: sin el detalle no se sabe cuántos documentos/km hay →
  // se muestra "…" (no un 0 falso).
  const detailLoaded = vehicle !== undefined;
  const documents = vehicle?.documents ?? [];
  const mileageCount = vehicle?.mileageCount;

  // Primer vencimiento de documento (dato real de expiresAt — sin cálculos
  // de "próximo mantenimiento", que el backend no entrega).
  const upcomingExpiry = documents
    .filter((document) => document.expiresAt)
    .sort(
      (a, b) =>
        new Date(a.expiresAt as string).getTime() -
        new Date(b.expiresAt as string).getTime(),
    )[0];

  const rows: MetricRow[] = [
    {
      label: "Última atención registrada",
      value: isLoading
        ? "…"
        : isError
          ? "No disponible"
          : hasCare && latestCare
            ? formatDate(
                latestCare.serviceDate ??
                  latestCare.checkedInAt ??
                  latestCare.createdAt,
              )
            : "Sin atenciones",
      detail:
        !isLoading && !isError && hasCare && latestCare ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {careRegistrant(latestCare)}
            </span>
            <Badge
              variant={
                latestCare.verification === "verified"
                  ? "success"
                  : "warning"
              }
              className="text-[10px]"
            >
              {latestCare.verification === "verified"
                ? "Verificada"
                : "Sin verificar"}
            </Badge>
          </span>
        ) : undefined,
    },
    {
      label: "Kilometraje de la última atención",
      value: isLoading
        ? "…"
        : isError
          ? "No disponible"
          : latestCare?.mileageIn != null
            ? `${latestCare.mileageIn.toLocaleString("es-AR")} km`
            : "Sin kilometraje",
    },
    {
      label: "Documentos y evidencias",
      value: !detailLoaded
        ? "…"
        : `${documents.length} ${documents.length === 1 ? "adjunto" : "adjuntos"}`,
      detail: upcomingExpiry ? (
        <span className="text-xs text-muted-foreground">
          Vencimiento más próximo: {formatDate(upcomingExpiry.expiresAt)}
        </span>
      ) : detailLoaded && documents.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          Facturas, órdenes de trabajo e imágenes
        </span>
      ) : undefined,
    },
    {
      label: "Registros de kilometraje",
      value: !detailLoaded
        ? "…"
        : `${mileageCount ?? 0} ${(mileageCount ?? 0) === 1 ? "registro" : "registros"}`,
    },
  ];

  const careVerified =
    historyStatus === "success"
      ? episodes.some((episode) => episode.verification === "verified")
      : undefined;

  return (
    <Card>
      <CardHeader className="pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Resumen de trazabilidad
        </p>
        {/* h2 real (no CardTitle, que es un div) → encabezado semántico */}
        <h2 className="font-heading text-lg leading-snug font-medium">
          Datos del vehículo
        </h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Métricas reales — label → valor (apilado en mobile) */}
        <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-1">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="mt-0.5 truncate text-sm font-semibold">
                {row.value}
              </dd>
              {row.detail && <dd className="mt-0.5">{row.detail}</dd>}
            </div>
          ))}
        </dl>

        {/* Checklist de completitud — ícono + texto (nunca solo color) */}
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Trazabilidad de la historia
          </p>
          <ul className="flex flex-col gap-1.5">
            <ChecklistItem
              done={detailLoaded ? (mileageCount ?? 0) > 0 : undefined}
              doneLabel="Kilometraje registrado"
              pendingLabel="Falta kilometraje"
            />
            <ChecklistItem
              done={
                historyStatus === "success"
                  ? episodes.length > 0
                  : undefined
              }
              doneLabel="Atención registrada"
              pendingLabel="Falta una atención"
            />
            <ChecklistItem
              done={detailLoaded ? documents.length > 0 : undefined}
              doneLabel="Documentos adjuntos"
              pendingLabel="Falta documentación"
            />
            <ChecklistItem
              done={careVerified}
              doneLabel="Verificación de taller"
              pendingLabel="Falta verificación de taller"
            />
          </ul>
        </div>

        {/* Acción hacia la documentación (dentro del detalle del vehículo) */}
        {vehicleId && (
          <Link
            href={`/vehicles/${vehicleId}`}
            className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Ver documentos del vehículo
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
