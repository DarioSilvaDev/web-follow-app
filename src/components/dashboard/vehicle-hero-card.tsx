"use client";

/**
 * Hero del vehículo activo — tarjeta principal del dashboard.
 *
 * El vehículo es el elemento visual dominante: identidad (marca/modelo,
 * patente, año), kilometraje actual, estado de la historia y acciones.
 *
 * Reglas de dominio aplicadas:
 * - El "titular" solo se muestra cuando el BACKEND lo confirma
 *   (ownership activo `endsAt === null` en GET /:id). Nunca se asume que la
 *   cuenta autenticada ni el taller que registró una atención son titulares.
 * - El estado de la historia se DERIVA de datos reales (careEpisodes del
 *   historial): sin % ni métricas inventadas.
 * - "Registrar atención" solo para taller (contexto WORKSHOP) o titular en
 *   PERSONAL; en DEALERSHIP no existe esa acción → no se renderiza.
 */

import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock, FileText, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  catalogLabel,
  yearsLabel,
} from "@/components/vehicle/vehicle-card";
import { formatDate } from "@/lib/format-date";
import { mileageSourceLabel } from "@/lib/vehicle-history";
import { cn } from "cn";
import type { Vehicle, VehicleCareEpisode } from "@/types/vehicle";

/** Estado de la historia, derivado SOLO de careEpisodes reales. */
export interface HistoryStatus {
  label: string;
  variant: "outline" | "success" | "warning";
  icon: LucideIcon;
}

/**
 * Deriva el estado de la historia del vehículo:
 * - sin episodios          → "Sin historial" (neutro)
 * - algún sin verificar    → "Requiere verificación" (ámbar)
 * - todos verificados      → "Historia verificada" (verde)
 * `undefined` → aún no cargado (el caller no muestra badge).
 */
export function deriveHistoryStatus(
  careEpisodes?: VehicleCareEpisode[],
): HistoryStatus | null {
  if (!careEpisodes) return null;
  if (careEpisodes.length === 0) {
    return { label: "Sin historial", variant: "outline", icon: FileText };
  }
  const hasPending = careEpisodes.some(
    (episode) => episode.verification !== "verified",
  );
  if (hasPending) {
    return { label: "Requiere verificación", variant: "warning", icon: Clock };
  }
  return { label: "Historia verificada", variant: "success", icon: BadgeCheck };
}

/**
 * Titular vigente confirmado por el backend (ownership activo).
 * Devuelve null cuando no hay titular expuesto (p. ej. acceso compartido sin
 * ownership) → la UI NO muestra la etiqueta en lugar de inventar una.
 * Nota: en GET /:id `ownerships` es el HISTÓRICO completo → filtrar `!endsAt`.
 */
export function activeOwnerLabel(vehicle: Vehicle): string | null {
  const active = vehicle.ownerships?.find((ownership) => !ownership.endsAt);
  if (!active) return null;
  if (active.dealership?.name) {
    return `${active.dealership.name} (concesionaria)`;
  }
  if (active.user) {
    const name = [active.user.firstName, active.user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return name || null;
  }
  return null;
}

interface VehicleHeroCardProps {
  /** Vehículo del DETALLE (GET /:id) — trae mileages/documents/ownerships. */
  vehicle: Vehicle;
  /** CareEpisodes del historial (undefined = aún no cargado). */
  careEpisodes?: VehicleCareEpisode[];
  /** Ruta de "Registrar atención" según actor (null → no aplica). */
  registerCareHref?: string;
}

export function VehicleHeroCard({
  vehicle,
  careEpisodes,
  registerCareHref,
}: VehicleHeroCardProps) {
  const latestMileage =
    vehicle.mileages && vehicle.mileages.length > 0
      ? vehicle.mileages[0]
      : null;
  const historyStatus = deriveHistoryStatus(careEpisodes);
  const ownerLabel = activeOwnerLabel(vehicle);
  const years = yearsLabel(vehicle);

  return (
    <Card className="border-border">
      <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
        {/* Identidad del vehículo */}
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10"
          >
            <Tag className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight sm:text-xl">
                {catalogLabel(vehicle)}
              </h2>
              <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-sm font-semibold">
                {vehicle.licensePlate}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {years}
              {vehicle.color ? ` · ${vehicle.color}` : ""}
            </p>
          </div>
        </div>

        {/* Kilometraje actual — número grande solo para dato vehicular */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Kilometraje actual
          </p>
          {latestMileage ? (
            <>
              <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
                {latestMileage.mileage.toLocaleString("es-AR")}
                <span className="ml-1.5 text-base font-medium text-muted-foreground">
                  km
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Registrado el {formatDate(latestMileage.recordedAt)}
                {latestMileage.recordedBy
                  ? ` · por ${latestMileage.recordedBy.displayName}`
                  : ` · ${mileageSourceLabel(latestMileage.source)}`}
              </p>
            </>
          ) : (
            <p className="mt-1 text-lg font-medium text-muted-foreground">
              Kilometraje no registrado
            </p>
          )}
        </div>

        {/* Estado de la historia + titular (solo si el backend lo confirma) */}
        <div className="flex flex-wrap items-center gap-2">
          {historyStatus && (
            <Badge variant={historyStatus.variant} className="text-xs">
              <historyStatus.icon className="mr-1 h-3 w-3" aria-hidden="true" />
              {historyStatus.label}
            </Badge>
          )}
          {ownerLabel && (
            <Badge variant="secondary" className="text-xs font-normal">
              Titular: {ownerLabel}
            </Badge>
          )}
        </div>

        {/* Acciones */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/vehicles/${vehicle.id}`}
            className="w-full sm:w-auto"
          >
            <Button className="min-h-11 w-full px-5 sm:w-auto">
              Ver historia completa
              <ArrowRight className="ml-1.5" aria-hidden="true" />
            </Button>
          </Link>
          {registerCareHref && (
            <Link href={registerCareHref} className="w-full sm:w-auto">
              <Button
                variant="outline"
                className={cn("min-h-11 w-full px-5 sm:w-auto")}
              >
                Registrar atención
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
