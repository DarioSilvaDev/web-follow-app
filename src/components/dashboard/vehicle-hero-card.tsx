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
 * - "Registrar servicio" solo para taller (contexto WORKSHOP) o titular en
 *   PERSONAL; en DEALERSHIP no existe esa acción → no se renderiza.
 * - "Registrar"/"Actualizar" (kilometraje) solo con `canRecordMileage`: sin
 *   registros el CTA es "Registrar" (completa la ficha); con registros pasa a
 *   "Actualizar". La regla de "carga única" se omitió a pedido de producto:
 *   el propietario también puede actualizar el km. La actualización es
 *   monotónica (RF-5) y solo para quien puede escribir.
 * - Sin `VehicleMileage` pero con una atención no cancelada que declaró km,
 *   el hero muestra ese dato CON procedencia + badge "Pendiente de
 *   verificación" y CTA "Confirmar kilometraje" (pre-carga el dialog; escribe
 *   por el flujo PERSONAL existente). Nunca se presenta como dato verificado.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  FileText,
  Gauge,
  Plus,
  Tag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  catalogLabel,
  yearsLabel,
} from "@/components/vehicle/vehicle-card";
import { MileageRegisterDialog } from "@/components/vehicle/mileage-register-dialog";
import { formatDate } from "@/lib/format-date";
import { latestEpisodeMileage, mileageSourceLabel } from "@/lib/vehicle-history";
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
 * - alguno rechazado       → "Verificación rechazada" (ámbar; estado
 *                            terminal — nunca "Requiere verificación")
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
  // D-209/D-071: la verificación solo aplica a episodios `source==="owner"`;
  // los de taller llevan `verification === null` → NO cuentan como pendientes.
  // (Antes `!== "verified" && !== "rejected"` los contaba como pendientes.)
  // Se conserva la garantía defensiva para valores owner desconocidos.
  const hasPending = careEpisodes.some(
    (episode) =>
      episode.source === "owner" &&
      episode.verification !== "verified" &&
      episode.verification !== "rejected",
  );
  if (hasPending) {
    return { label: "Requiere verificación", variant: "warning", icon: Clock };
  }
  const hasRejected = careEpisodes.some(
    (episode) => episode.verification === "rejected",
  );
  if (hasRejected) {
    return { label: "Verificación rechazada", variant: "warning", icon: Clock };
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
  /** Ruta de "Registrar servicio" según actor (null → no aplica). */
  registerCareHref?: string;
  /**
   * Permiso para registrar kilometraje. Se calcula con las `capabilities` del
   * backend (o el fallback de ownership del caller). Sin valor se usa
   * `vehicle.capabilities?.canRecordMileage` (tolerancia a backends previos).
   */
  canRecordMileage?: boolean;
}

export function VehicleHeroCard({
  vehicle,
  careEpisodes,
  registerCareHref,
  canRecordMileage,
}: VehicleHeroCardProps) {
  const [mileageOpen, setMileageOpen] = useState(false);
  // Valor pre-cargado al abrir el dialog ("Confirmar kilometraje" desde el
  // fallback de la atención). `undefined` = input vacío ("Actualizar").
  const [mileagePrefill, setMileagePrefill] = useState<number | undefined>(
    undefined,
  );
  // Misma tolerancia de contrato que el detalle: capabilities manda; si el
  // backend aún no las envía, el caller decide (ownership).
  const canRegisterMileage =
    canRecordMileage ?? vehicle.capabilities?.canRecordMileage ?? false;
  const latestMileage =
    vehicle.mileages && vehicle.mileages.length > 0
      ? vehicle.mileages[0]
      : null;
  // Sin VehicleMileage pero con una atención no cancelada que declaró km:
  // mostrar el dato declarado (sin verificar) + CTA de confirmación (PM E).
  const fallbackMileage = latestMileage
    ? null
    : latestEpisodeMileage(careEpisodes);
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-primary/10"
          >
            <Tag className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-lg font-semibold tracking-tight sm:text-xl">
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
              {/* Mobile-first: la cifra y "Actualizar" comparten fila en
                  sm+; en pantallas chicas el botón queda bajo la cifra
                  (flex-wrap) sin recortarse. */}
              <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
                <p className="text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
                  {latestMileage.mileage.toLocaleString("es-AR")}
                  <span className="ml-1.5 text-base font-medium text-muted-foreground">
                    km
                  </span>
                </p>
                {/* La regla de "carga única" se omitió a pedido de
                    producto: con km ya cargado, quien puede escribir
                    igualmente actualiza (valor monotónico, RF-5). */}
                {canRegisterMileage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMileageOpen(true)}
                    aria-label="Actualizar kilometraje"
                    className="shrink-0"
                  >
                    <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                    Actualizar
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Registrado el {formatDate(latestMileage.recordedAt)}
                {latestMileage.recordedBy
                  ? ` · por ${latestMileage.recordedBy.displayName}`
                  : ` · ${mileageSourceLabel(latestMileage.source)}`}
              </p>
            </>
          ) : fallbackMileage ? (
            <>
              {/* Dato declarado en una atención, sin VehicleMileage todavía.
                  Se muestra CON procedencia y badge — nunca como hecho
                  verificado (PM E). El CTA "Confirmar" escribe por el flujo
                  PERSONAL existente (source=owner, monotonía + audit D-02). */}
              <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
                <p className="text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
                  {fallbackMileage.mileage.toLocaleString("es-AR")}
                  <span className="ml-1.5 text-base font-medium text-muted-foreground">
                    km
                  </span>
                </p>
                {canRegisterMileage && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0"
                      aria-label="Confirmar kilometraje"
                      onClick={() => {
                        setMileagePrefill(fallbackMileage.mileage);
                        setMileageOpen(true);
                      }}
                    >
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Confirmar kilometraje
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      aria-label="Actualizar kilometraje"
                      onClick={() => {
                        setMileagePrefill(undefined);
                        setMileageOpen(true);
                      }}
                    >
                      <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                      Actualizar
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="warning" className="text-xs">
                  <Clock className="mr-1 size-[14px]" aria-hidden="true" />
                  Pendiente de verificación
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Dato declarado por {fallbackMileage.registrant ?? "el taller"}{" "}
                en esta atención (odómetro de {fallbackMileage.phase})
                {fallbackMileage.at ? ` el ${formatDate(fallbackMileage.at)}` : ""}.
                No verificado por vos.
              </p>
            </>
          ) : (
            <div className="mt-1 flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-lg font-medium text-muted-foreground">
                  Kilometraje no registrado
                </p>
                {/* Sin registros → modo register (completa la ficha). La
                    carga es siempre de un dato real: el CTA existe solo
                    para quien puede escribir. */}
                {canRegisterMileage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMileagePrefill(undefined);
                      setMileageOpen(true);
                    }}
                    aria-label="Registrar kilometraje"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Registrar
                  </Button>
                )}
              </div>
              {canRegisterMileage && (
                <p className="text-xs text-muted-foreground">
                  Sumá el kilometraje actual para completar la ficha.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Un solo dialog; el modo lo define si hay registros. */}
        {canRegisterMileage && (
          <MileageRegisterDialog
            open={mileageOpen}
            onOpenChange={setMileageOpen}
            vehicle={{ id: vehicle.id, licensePlate: vehicle.licensePlate }}
            mode={latestMileage ? "update" : "register"}
            currentMileage={latestMileage?.mileage}
            defaultMileage={mileagePrefill}
          />
        )}

        {/* Estado de la historia + titular (solo si el backend lo confirma) */}
        <div className="flex flex-wrap items-center gap-2">
          {historyStatus && (
            <Badge variant={historyStatus.variant} className="text-xs">
              <historyStatus.icon className="mr-1 size-[14px]" aria-hidden="true" />
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
                Registrar servicio
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
