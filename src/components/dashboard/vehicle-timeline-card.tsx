"use client";

/**
 * Últimos registros del historial del vehículo (timeline, orden desc).
 *
 * - Reutiliza `mergeHistory` (lógica F-014/D-052 existente) — NO se
 *   duplica la lógica de fusión de las 4 fuentes.
 * - El taller aparece como REGISTRANTE de la atención ("Registrado por
 *   {taller}"), nunca como propietario (regla de dominio HCDV).
 * - El km de cada atención sale del crudo de `careEpisodes` (mergeHistory no
 *   lo expone); la verificación también.
 * - Evidencias: el endpoint GET /:id/history NO expone adjuntos por
 *   episodio → no se muestran (no se inventan datos).
 */

import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  ClipboardList,
  Gauge,
  Loader2,
  RotateCw,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format-date";
import { mergeHistory } from "@/lib/vehicle-history";
import type {
  TimelineEntry,
  TimelineEntryType,
} from "@/lib/vehicle-history";
import type {
  VehicleCareEpisode,
  VehicleHistoryResponse,
} from "@/types/vehicle";

const TYPE_ICONS: Record<TimelineEntryType, LucideIcon> = {
  care: ClipboardList,
  mileage: Gauge,
  ownership: User,
  transfer: ArrowLeftRight,
};

interface VehicleTimelineCardProps {
  vehicleId: string;
  historyStatus: "loading" | "error" | "success";
  /** Solo presente con `historyStatus === "success"`. */
  history?: VehicleHistoryResponse;
  onRetry: () => void;
  /** CTA del estado vacío (null → sin acción disponible). */
  registerCareHref?: string;
  /** Máximo de items visibles en el dashboard. */
  limit?: number;
}

/** Metadatos crudos de una atención (km + verificación) por id. */
function careIndex(
  history?: VehicleHistoryResponse,
): Map<string, VehicleCareEpisode> {
  const map = new Map<string, VehicleCareEpisode>();
  for (const episode of history?.careEpisodes ?? []) {
    map.set(episode.id, episode);
  }
  return map;
}

function TimelineItem({
  entry,
  vehicleId,
  care,
}: {
  entry: TimelineEntry;
  vehicleId: string;
  care?: VehicleCareEpisode;
}) {
  const Icon = TYPE_ICONS[entry.type];
  const isCare = entry.type === "care" && Boolean(entry.careId);
  const workshopName = care?.workshopName ?? care?.workshop?.name;
  // Taller como REGISTRANTE (source=workshop) o VERIFICANTE (solo cuando
  // verification=verified). Un episodio del dueño con nombre de taller
  // pendiente de verificación NO es "Verificado por" (misma regla que
  // traceability-summary-card).
  const registrant =
    care != null && workshopName
      ? care.source === "workshop"
        ? `Registrado por ${workshopName}`
        : care.verification === "verified"
          ? `Verificado por ${workshopName}`
          : entry.actor
      : entry.actor;

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {/* Rail vertical entre items */}
      <span
        aria-hidden="true"
        className="absolute left-[15px] top-9 h-[calc(100%-1.5rem)] w-0.5 bg-border last:hidden"
      />
      <span
        aria-hidden="true"
        className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background"
      >
        <Icon className="h-4 w-4 text-primary" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-medium leading-snug">
            {entry.title}
          </p>
          <time
            dateTime={entry.date}
            className="shrink-0 text-xs text-muted-foreground"
          >
            {formatDate(entry.date)}
          </time>
        </div>

        {registrant && (
          <p className="mt-0.5 text-xs text-muted-foreground">{registrant}</p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {care?.mileageIn != null && (
            <span className="font-mono text-xs text-muted-foreground">
              {care.mileageIn.toLocaleString("es-AR")} km
            </span>
          )}
          {care && (
            <Badge
              variant={
                care.verification === "verified" ? "success" : "warning"
              }
              className="text-[10px]"
            >
              {care.verification === "verified"
                ? "Verificado"
                : "Pendiente de verificación"}
            </Badge>
          )}
          {isCare && entry.careId && (
            <Link
              href={`/vehicles/${vehicleId}/servicios/${entry.careId}`}
              className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Ver detalle
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

export function VehicleTimelineCard({
  vehicleId,
  historyStatus,
  history,
  onRetry,
  registerCareHref,
  limit = 5,
}: VehicleTimelineCardProps) {
  const entries =
    historyStatus === "success" && history
      ? mergeHistory(history).slice(0, limit)
      : [];
  const cares = careIndex(history);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Historia del vehículo
            </p>
            {/* h2 real (no CardTitle, que es un div) → encabezado semántico */}
            <h2 className="font-heading text-lg leading-snug font-medium">
              Últimos registros
            </h2>
          </div>
          <Link
            href={`/vehicles/${vehicleId}`}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver historia completa
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {historyStatus === "loading" ? (
          <div
            className="flex items-center justify-center py-10"
            role="status"
            aria-label="Cargando historial"
          >
            <Loader2
              className="h-5 w-5 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        ) : historyStatus === "error" ? (
          <div className="flex flex-col items-center py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No se pudo cargar el historial del vehículo.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onRetry}
            >
              <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Todavía no hay atenciones registradas"
            description="Cuando registres la primera atención, va a aparecer acá con su fecha, kilometraje y quién la registró."
            action={
              registerCareHref ? (
                <Link href={registerCareHref}>
                  <Button>
                    <ClipboardList className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Registrar atención
                  </Button>
                </Link>
              ) : undefined
            }
            className="py-8"
          />
        ) : (
          <ol className="flex flex-col">
            {entries.map((entry) => (
              <TimelineItem
                key={entry.id}
                entry={entry}
                vehicleId={vehicleId}
                care={entry.careId ? cares.get(entry.careId) : undefined}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
