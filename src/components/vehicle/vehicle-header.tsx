"use client";

import Link from "next/link";
import { ArrowLeft, Calendar, Gauge, Pencil, StickyNote, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { vehicleColorHex } from "@/lib/vehicle-colors";
import type { Vehicle } from "@/types/vehicle";

interface VehicleHeaderProps {
  vehicle: Vehicle;
  /**
   * D-12 (Gap 1): capacidad de edición calculada por el backend para este
   * usuario/contexto. Controla el botón "Editar" (ownership ≠ access).
   */
  canEdit?: boolean;
  /**
   * F-013 §7: muestra el badge "Acceso compartido" cuando el usuario NO es el
   * titular (relación de propiedad). Concepto distinto de `canEdit`.
   */
  showSharedBadge?: boolean;
}

function catalogLabel(vehicle: Vehicle): string | null {
  // MVP sin versiones: marca + modelo (la `version` legacy no se muestra).
  const parts = [vehicle.brand, vehicle.model].filter((part): part is string =>
    Boolean(part && part?.trim()),
  );
  return parts.length > 0 ? parts.join(" ") : null;
}

export function VehicleHeader({
  vehicle,
  canEdit = false,
  showSharedBadge = false,
}: VehicleHeaderProps) {
  const catalog = catalogLabel(vehicle);
  const latestMileage =
    vehicle.mileages && vehicle.mileages.length > 0
      ? vehicle.mileages[0]
      : null;

  const years = [vehicle.manufactureYear, vehicle.modelYear].filter(
    (y): y is number => typeof y === "number",
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/vehicles"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Vehículos
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">
          {vehicle.licensePlate}
        </span>
      </div>

      {/* Header card */}
      <div className="rounded-card border border-border bg-card p-card sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left: vehicle identity */}
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <Tag className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {/* Matrícula con tratamiento de "patente": borde doble, fondo
                    neutro y mono en mayúsculas con tracking amplio para que
                    la patente se reconozca de un vistazo. El h1 conserva la
                    semántica de encabezado (el nombre accesible sigue siendo
                    la patente). */}
                <h1 className="min-w-0">
                  <span className="inline-flex items-center rounded-md border-2 border-border bg-muted/50 p-0.5">
                    <span className="rounded-[4px] border border-border/70 px-2 py-0.5 font-mono text-lg font-bold uppercase tracking-[0.15em] text-foreground">
                      {vehicle.licensePlate}
                    </span>
                  </span>
                </h1>
                {/* F-013 §7 / D-048: badge "Acceso compartido" para non-owners
                    (documentado en DECISION-REGISTER §20; se restauró tras el
                    refactor a VehicleHeader en 2-3). */}
                {showSharedBadge && (
                  <Badge variant="secondary" className="text-xs font-medium">
                    Acceso compartido
                  </Badge>
                )}
              </div>
              {catalog && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {catalog}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                {years.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {years.join(" / ")}
                  </span>
                )}
                {vehicle.color && (
                  <span className="inline-flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-full border border-border"
                      style={{
                        // Color declarado (catálogo es): CSS no entiende "rojo",
                        // de ahí el mapa `vehicleColorHex`. Sin match conocido,
                        // el círculo queda sin relleno antes que mostrar un
                        // color equivocado.
                        backgroundColor:
                          vehicleColorHex(vehicle.color) ?? "transparent",
                      }}
                    />
                    {vehicle.color}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: mileage + actions */}
          <div className="flex items-center gap-3 shrink-0">
            {latestMileage && (
              <Badge variant="secondary" className="font-mono text-sm">
                <Gauge className="mr-1.5 h-3.5 w-3.5" />
                {latestMileage.mileage.toLocaleString("es-AR")} km
              </Badge>
            )}
            {canEdit && (
              <Link href={`/vehicles/${vehicle.id}/edit`}>
                <Button variant="outline" size="sm">
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Editar
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Notas — antes vivían en la Ficha (sección duplicada, removida).
            El bloque es permanente (decisión de producto): con notas muestra el
            texto; sin notas muestra el placeholder "Sin notas registradas". */}
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
            Notas
          </p>
          {vehicle.notes?.trim() ? (
            <p className="mt-1 text-sm whitespace-pre-wrap text-foreground">
              {vehicle.notes.trim()}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Sin notas registradas
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
