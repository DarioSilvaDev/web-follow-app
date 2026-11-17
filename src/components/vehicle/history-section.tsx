"use client";

/**
 * Historial del vehículo (F-014 / iteración 2-3 · Plan 05): merge cronológico
 * de transfers + kilometrajes + ownerships + care episodes (D-052 / D-069..D-071).
 *
 * Wrapper del detalle del vehículo alrededor del componente compartido
 * `HistoryTimeline` (misma UI "una sola IA para la historia del vehículo" que
 * en el dashboard). El merge vive en `mergeHistory` — no se duplica.
 */

import { ClipboardList, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { mergeHistory } from "@/lib/vehicle-history";
import type { VehicleHistoryResponse } from "@/types/vehicle";
import { HistoryTimeline } from "@/components/vehicle/history-timeline";

interface HistorySectionProps {
  /** Salida de GET /vehicles/:id/history (undefined mientras carga). */
  history?: VehicleHistoryResponse;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  vehicleId: string;
}

export function HistorySection({
  history,
  isLoading,
  isError,
  refetch,
  vehicleId,
}: HistorySectionProps) {
  // El conteo real lo calcula el merge compartido; acá solo se necesita para
  // el encabezado/estados (misma semántica que antes: 4 fuentes → > 0 entradas).
  const entryCount = history ? mergeHistory(history).length : 0;

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
          {entryCount > 0
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
        ) : !history || entryCount === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Sin eventos registrados"
            description="Cuando registres un servicio, kilometraje o transferencia, va a aparecer acá con su fecha y quién lo registró."
            className="py-6"
          />
        ) : (
          <HistoryTimeline history={history} vehicleId={vehicleId} />
        )}
      </CardContent>
    </Card>
  );
}
