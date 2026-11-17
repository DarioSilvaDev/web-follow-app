"use client";

/**
 * Historial/timeline unificado del vehículo (F-014 · D-052 · D-069..D-071 · iteración 2-4).
 *
 * Una sola IA para la historia del vehículo, usada tanto en el dashboard
 * ("Últimos registros", últimos N) como en el detalle ("Historial", todos los
 * registros): mismo rail + iconos circulares, mismas reglas de verificación y
 * mismo layout de fila (título + fecha/hora arriba, actor, km + badge de
 * verificación, notas y deep-link al detalle).
 *
 * El taller aparece SIEMPRE como registrante/verificante, nunca como
 * propietario (regla de dominio HCDV):
 * - `source === "workshop"` → actor "Registrado por {taller}".
 * - dueño verificado → "Verificado por {taller}".
 * - resto del actor: el del merge (`mergeHistory`).
 *
 * Los iconos dependen del tipo de evento; para las atenciones (`care`) el
 * icono distingue el origen: taller = `Wrench`, dueño = `ClipboardList`.
 * `mergeHistory` (F-014/D-052) es el único lugar donde se fusionan las
 * fuentes — NO se duplica esa lógica.
 */
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  Car,
  ClipboardList,
  Gauge,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateOnly } from "@/lib/format-date";
import { mergeHistory } from "@/lib/vehicle-history";
import type {
  TimelineEntry,
  TimelineEntryType,
} from "@/lib/vehicle-history";
import type {
  VehicleCareEpisode,
  VehicleHistoryResponse,
} from "@/types/vehicle";

const ENTRY_TYPE_ICONS: Record<TimelineEntryType, LucideIcon> = {
  transfer: ArrowLeftRight,
  mileage: Gauge,
  ownership: Car,
  care: ClipboardList, // se reemplaza por origen (workshop → Wrench)
};

/** Índice de atenciones por id para resolver km/verificación/origen. */
function careIndex(
  history?: VehicleHistoryResponse,
): Map<string, VehicleCareEpisode> {
  const map = new Map<string, VehicleCareEpisode>();
  for (const episode of history?.careEpisodes ?? []) {
    map.set(episode.id, episode);
  }
  return map;
}

/** Fecha calendario → dd/mm/yyyy (UTC, sin hora) · instante → con hora. */
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

/**
 * Plan 05 / F-TZ-7: `dateKind` decide **zona horaria**, no si se muestra hora.
 * - `date` → fecha calendario en UTC (`formatDateOnly`), nunca hora.
 * - `instant` → mismo render del snapshot histórico (con hora cuando la trae).
 */
function formatEntryDate(entry: TimelineEntry): string {
  return entry.dateKind === "date"
    ? formatDateOnly(entry.dateOnly, "numeric")
    : formatTimelineDate(entry.date);
}

/**
 * Actor de la atención (PDP-3 / PROD-005): snapshot primero, relación viva
 * solo como fallback. El taller NUNCA como propietario: verificado →
 * "Verificado por {taller}"; workshop registrado → "Registrado por {taller}";
 * si no, se conserva el actor del merge (D-063/D-071).
 */
function careActor(entry: TimelineEntry, care: VehicleCareEpisode): string {
  const workshopName = care.workshopName ?? care.workshop?.name;
  if (!workshopName) return entry.actor ?? "";
  if (care.source === "workshop") return `Registrado por ${workshopName}`;
  if (care.verification === "verified")
    return `Verificado por ${workshopName}`;
  return entry.actor ?? "";
}

export function VerificationBadge({ care }: { care: VehicleCareEpisode }) {
  const workshopName = care.workshopName ?? care.workshop?.name;
  const label =
    care.verification === "verified"
      ? "Verificado"
      : care.verification === "rejected"
        ? workshopName
          ? `Rechazado por ${workshopName}`
          : "Rechazado por el taller responsable"
        : "Pendiente de verificación";
  return (
    <Badge
      variant={
        care.verification === "verified"
          ? "success"
          : care.verification === "rejected"
            ? "destructive"
            : "warning"
      }
      className="text-xs"
    >
      {label}
    </Badge>
  );
}

function HistoryEntry({
  entry,
  vehicleId,
  care,
}: {
  entry: TimelineEntry;
  vehicleId: string;
  care?: VehicleCareEpisode;
}) {
  const Icon =
    entry.type === "care" && care?.source === "workshop"
      ? Wrench
      : ENTRY_TYPE_ICONS[entry.type];
  const isCare = entry.type === "care" && Boolean(entry.careId);
  const actor =
    entry.type === "care" && care ? careActor(entry, care) : entry.actor;
  const showMeta = care?.mileageIn != null || care || (isCare && entry.careId);

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
            {formatEntryDate(entry)}
          </time>
        </div>

        {actor ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{actor}</p>
        ) : null}

        {showMeta ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {care?.mileageIn != null && (
              <span className="font-mono text-xs text-muted-foreground">
                {care.mileageIn.toLocaleString("es-AR")} km
              </span>
            )}
            {care && <VerificationBadge care={care} />}
            {isCare && entry.careId && (
              <Link
                href={`/vehicles/${vehicleId}/servicios/${entry.careId}`}
                className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Ver detalle
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        ) : null}

        {entry.notes ? (
          <p className="mt-1 text-xs text-muted-foreground/80 line-clamp-2">
            {entry.notes}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function HistoryTimeline({
  history,
  vehicleId,
  limit,
}: {
  history: VehicleHistoryResponse;
  vehicleId: string;
  /** Cap de items visibles (dashboard "Últimos registros"). Sin cap → todos. */
  limit?: number;
}) {
  const entries = mergeHistory(history);
  const visible = limit ? entries.slice(0, limit) : entries;
  const cares = careIndex(history);

  return (
    <ol className="flex flex-col">
      {visible.map((entry) => (
        <HistoryEntry
          key={entry.id}
          entry={entry}
          vehicleId={vehicleId}
          care={entry.careId ? cares.get(entry.careId) : undefined}
        />
      ))}
    </ol>
  );
}
