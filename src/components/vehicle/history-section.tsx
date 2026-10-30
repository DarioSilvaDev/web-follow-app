"use client";

/**
 * Historial del vehículo (F-014 / iteración 2-3): merge cronológico de
 * transfers + kilometrajes + ownerships + care episodes (D-052 / D-069..D-071).
 *
 * Extraída del page monolítico; reutiliza `mergeHistory` (misma lógica que el
 * timeline del dashboard) y su MISMO lenguaje visual (rail + iconos circulares):
 * una sola IA para la historia del vehículo. El actor/registrante sale resuelto
 * de mergeHistory — el taller nunca aparece como propietario (regla HCDV).
 */

import Link from "next/link";
import {
  ArrowRightLeft,
  ClipboardList,
  Car,
  Gauge,
  RotateCw,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { mergeHistory } from "@/lib/vehicle-history";
import type {
  TimelineEntry,
  TimelineEntryType,
} from "@/lib/vehicle-history";
import type { VehicleHistoryResponse } from "@/types/vehicle";

const TIMELINE_TYPE_ICONS: Record<TimelineEntryType, LucideIcon> = {
  transfer: ArrowRightLeft,
  mileage: Gauge,
  ownership: Car,
  care: Wrench,
};

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

interface HistorySectionProps {
  /** Salida de GET /vehicles/:id/history (undefined mientras carga). */
  history?: VehicleHistoryResponse;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  vehicleId: string;
}

/** Contenido de una entrada (título, fecha, actor, badge, notas). */
function TimelineItemBody({ entry }: { entry: TimelineEntry }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="min-w-0 text-sm font-medium leading-snug">
          {entry.title}
        </p>
        <time
          dateTime={entry.date}
          className="shrink-0 text-xs text-muted-foreground"
        >
          {formatTimelineDate(entry.date)}
        </time>
      </div>
      {entry.actor ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{entry.actor}</p>
      ) : null}
      {entry.badge ? (
        <p className="mt-0.5 text-xs font-medium text-muted-foreground">
          {entry.badge}
        </p>
      ) : null}
      {entry.notes ? (
        <p className="mt-1 text-xs text-muted-foreground/80">{entry.notes}</p>
      ) : null}
    </>
  );
}

export function HistorySection({
  history,
  isLoading,
  isError,
  refetch,
  vehicleId,
}: HistorySectionProps) {
  const entries = history ? mergeHistory(history) : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Historia del vehículo
        </p>
        {/* h2 real (no CardTitle, que es un div) → encabezado semántico */}
        <h2 className="font-heading text-lg leading-snug font-medium">
          Historial
        </h2>
        <CardDescription>
          {entries.length > 0
            ? "Del más reciente al más antiguo."
            : "Atenciones, transferencias, kilometraje y cambios de propiedad."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          // Skeleton progresivo (la 4ª llamada no bloquea el resto de la página).
          <div
            role="status"
            aria-label="Cargando historial"
            className="flex flex-col gap-4 py-1"
          >
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted"
                />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No se pudo cargar el historial.
            </p>
            <Button variant="outline" size="sm" onClick={refetch}>
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Sin eventos registrados"
            description="Cuando registres un servicio, kilometraje o transferencia, va a aparecer acá con su fecha y quién lo registró."
            className="py-6"
          />
        ) : (
          <ol className="flex flex-col">
            {entries.map((entry, index) => {
              const Icon = TIMELINE_TYPE_ICONS[entry.type];
              const isCare = entry.type === "care" && Boolean(entry.careId);
              const isLast = index === entries.length - 1;

              return (
                <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {/* Rail vertical entre items (se corta en el último) */}
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[11px] top-7 h-[calc(100%-1.5rem)] w-0.5 bg-border"
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className="relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background"
                  >
                    <Icon className="h-3 w-3 text-primary" />
                  </span>

                  <div className="min-w-0 flex-1">
                    {isCare && entry.careId ? (
                      // Iteración 2-4: deep-link al detalle del servicio. Ancla
                      // nativa (next/link) → accesible por teclado / botón medio.
                      <Link
                        href={`/vehicles/${vehicleId}/servicios/${entry.careId}`}
                        aria-label={`Ver detalle de ${entry.title}`}
                        className="block -mx-1 rounded-md px-1 py-0.5 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <TimelineItemBody entry={entry} />
                      </Link>
                    ) : (
                      <TimelineItemBody entry={entry} />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
