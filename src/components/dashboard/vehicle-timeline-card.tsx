"use client";

/**
 * Últimos registros del historial del vehículo (dashboard).
 *
 * Wrapper del dashboard alrededor del componente compartido `HistoryTimeline`
 * (misma IA que el detalle del vehículo). Delega la fusión de las 4 fuentes en
 * `mergeHistory` (F-014/D-052) y solo aporta el chrome de la tarjeta
 * ("HISTORIA DEL VEHÍCULO / Últimos registros" + link a la historia completa).
 */

import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  Loader2,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { VehicleHistoryResponse } from "@/types/vehicle";
import { mergeHistory } from "@/lib/vehicle-history";
import { HistoryTimeline } from "@/components/vehicle/history-timeline";

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

export function VehicleTimelineCard({
  vehicleId,
  historyStatus,
  history,
  onRetry,
  registerCareHref,
  limit = 5,
}: VehicleTimelineCardProps) {
  const entries =
    historyStatus === "success" && history ? history : undefined;
  const entryCount = entries ? mergeHistory(entries).length : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
        ) : !entries || entryCount === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Todavía no hay atenciones registradas"
            description="Cuando registres la primera atención, va a aparecer acá con su fecha, kilometraje y quién la registró."
            action={
              registerCareHref ? (
                <Link href={registerCareHref}>
                  <Button>
                    <ClipboardList className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Registrar servicio
                  </Button>
                </Link>
              ) : undefined
            }
            className="py-8"
          />
        ) : (
          // entries está definido (se verificó arriba); TS no lo estrecha
          // dentro del ternario de JSX.
          <HistoryTimeline
            history={entries}
            vehicleId={vehicleId}
            limit={limit}
          />
        )}
      </CardContent>
    </Card>
  );
}
