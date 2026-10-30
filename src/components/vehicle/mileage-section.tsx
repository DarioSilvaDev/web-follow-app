"use client";

/**
 * Sección de kilometraje (detalle /vehicles/[id]).
 *
 * Extraída del page monolítico sin cambio de comportamiento: mismos labels,
 * misma validación y misma tolerancia D-11 Gap 1 (0 km renderiza; distinguir
 * "sin registros" de "hay registros pero los últimos no vinieron").
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { vehicleApi } from "@/lib/api";
import { errorStatus } from "@/lib/api-error";
import { formatDateTime } from "@/lib/format-date";
import { vehicleKeys } from "@/lib/query-keys";
import { mileageSourceLabel } from "@/lib/vehicle-history";
import type { Vehicle } from "@/types/vehicle";

export function MileageSection({
  vehicle,
  canWrite,
}: {
  vehicle: Vehicle;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [km, setKm] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const record = useMutation({
    mutationFn: (dto: { mileage: number; notes?: string }) =>
      vehicleApi.recordMileage(vehicle.id, dto),
    onSuccess: () => {
      setKm("");
      setNotes("");
      setFormError(null);
      // GET /:id incluye los últimos 5 km — invalidar con el prefijo del vehículo.
      queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(vehicle.id) });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = Number(km);
    if (!km.trim() || Number.isNaN(parsed) || parsed < 0) {
      setFormError("Ingresá un kilometraje válido.");
      return;
    }
    // D-11 (Gap 1): el payload es { mileage, notes? } — el backend deriva
    // source/recordedBy del contexto activo (concesionaria u dueño).
    record.mutate(
      { mileage: Math.round(parsed), notes: notes.trim() || undefined },
      {
        onError: (error) => {
          const status = errorStatus(error);
          if (status === 400 || status === 409) {
            setFormError(
              "El kilometraje debe ser mayor o igual al último registrado (RF-5).",
            );
          } else if (status === 403) {
            setFormError("No tenés permiso para registrar kilometraje.");
          } else {
            setFormError("No se pudo registrar el kilometraje. Intentalo nuevamente.");
          }
        },
      },
    );
  };

  const mileages = vehicle.mileages ?? [];
  // D-11 (Gap 1): distinguir "sin registros" (mileageCount 0) de "hay registros
  // pero los últimos no vinieron" — y garantizar que un registro de 0 km se
  // renderice (no colapsa a estado vacío).
  const totalCount = vehicle.mileageCount ?? mileages.length;
  const hasAnyRecord = totalCount > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Historia del vehículo
        </p>
        {/* h2 real (no CardTitle, que es un div) → encabezado semántico */}
        <h2 className="font-heading text-lg leading-snug font-medium">
          Kilometraje
        </h2>
        <CardDescription>
          {hasAnyRecord
            ? "Últimos registros de kilometraje."
            : "Registrá el kilometraje para mantener la historia del vehículo."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mileages.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            {hasAnyRecord
              ? "No se pudieron cargar los últimos registros."
              : "Todavía no hay registros de kilometraje."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mileages.map((mileage) => (
              <li
                key={mileage.id}
                className="flex items-baseline justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {mileage.mileage.toLocaleString("es-AR")} km
                  </p>
                  {mileage.notes ? (
                    <p className="text-muted-foreground text-xs">
                      {mileage.notes}
                    </p>
                  ) : null}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>
                    {mileage.recordedBy?.displayName ??
                      mileageSourceLabel(mileage.source)}
                  </p>
                  <p>{formatDateTime(mileage.recordedAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {canWrite && (
          <form
            className="grid gap-3 rounded-lg border border-border/60 p-3"
            onSubmit={handleSubmit}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="mileage-km">Kilometraje (km)</Label>
              <Input
                id="mileage-km"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="Ej. 25000"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mileage-notes">Notas (opcional)</Label>
              <Textarea
                id="mileage-notes"
                rows={2}
                placeholder="Ej. Cambio de aceite realizado"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={record.isPending}
            >
              {record.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Registrando...
                </>
              ) : (
                "Registrar km"
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
