"use client";

/**
 * Dialog "Registrar/Actualizar kilometraje" — usado desde el hero del dashboard.
 *
 * Decisiones:
 * - Dos modos (`mode`, default "register"): "register" (vehículo sin registros,
 *   completa la ficha) y "update" (ya hay registros). La regla de "carga única"
 *   se omitió a pedido de producto: el propietario también puede ACTUALIZAR el
 *   km. La carga sigue siendo siempre un dato real y monotónico (el backend
 *   valida RF-5; el 400/409 es un caso común y válido, se respeta el copy).
 *   Solo para quien puede escribir (mismo permiso `canRecordMileage`).
 * - SIN campo de Notas: la carga es un único dato (km). El payload es
 *   `{ mileage }`: el backend deriva `source`/`recordedBy` del contexto activo
 *   (D-11 Gap 1). La RPC acepta `notes?` pero la UI no lo envía.
 * - Validación y copy de errores idénticos a `MileageSection` (fuente de
 *   verdad del detalle, hoy fuera de esa página por decisión de producto),
 *   para que ambos flujos no diverjan.
 * - El feedback es implícito — convención del repo: sin toasts.
 * - El cuerpo se monta solo con el dialog abierto → inputs/error arrancan
 *   limpios en cada apertura, sin efectos de reset.
 *   (`defaultMileage` se aplica acá: cada apertura re-inicializa el input.)
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Dialog,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { vehicleApi } from "@/lib/api";
import { errorStatus } from "@/lib/api-error";
import { invalidateVehicleViews, vehicleKeys } from "@/lib/query-keys";

export interface MileageRegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Solo lo que la UI necesita: id para mutar y patente para el copy. */
  vehicle: { id: string; licensePlate: string };
  /**
   * Modo del dialog: "register" (sin km todavía, completa la ficha) o
   * "update" (ya hay registros). Default "register".
   */
  mode?: "register" | "update";
  /** Último km registrado — solo para el copy del modo "update". */
  currentMileage?: number;
  /**
   * Valor pre-cargado en el input (p. ej. el km declarado en una atención
   * para que el titular lo confirme sin re-tipear). El cuerpo se monta en
   * cada apertura → el default se aplica en cada apertura.
   */
  defaultMileage?: number;
}

export function MileageRegisterDialog({
  open,
  onOpenChange,
  vehicle,
  mode = "register",
  currentMileage,
  defaultMileage,
}: MileageRegisterDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <MileageRegisterDialogBody
          vehicle={vehicle}
          onOpenChange={onOpenChange}
          mode={mode}
          currentMileage={currentMileage}
          defaultMileage={defaultMileage}
        />
      ) : null}
    </Dialog>
  );
}

function MileageRegisterDialogBody({
  vehicle,
  onOpenChange,
  mode,
  currentMileage,
  defaultMileage,
}: Omit<MileageRegisterDialogProps, "open">) {
  const queryClient = useQueryClient();
  const [km, setKm] = useState(
    defaultMileage !== undefined ? String(defaultMileage) : "",
  );
  const [formError, setFormError] = useState<string | null>(null);

  const isUpdate = mode === "update";
  const title = isUpdate ? "Actualizar kilometraje" : "Registrar kilometraje";
  const submitLabel = title;
  const description = isUpdate
    ? `El último registro es ${(currentMileage ?? 0).toLocaleString(
        "es-AR",
      )} km. Ingresá un valor igual o mayor.`
    : `Ingresá el kilometraje actual de ${vehicle.licensePlate}. Este dato completa la ficha del vehículo.`;

  const record = useMutation({
    mutationFn: (dto: { mileage: number }) =>
      vehicleApi.recordMileage(vehicle.id, dto),
    onSuccess: () => {
      setKm("");
      setFormError(null);
      // GET /:id incluye los últimos 5 km: invalidar con el prefijo del
      // vehículo cubre también la subclave del historial. Las listas/dashboard
      // se refrescan aparte (invalidateVehicleViews).
      queryClient.invalidateQueries({
        queryKey: vehicleKeys.detail(vehicle.id),
      });
      void invalidateVehicleViews(queryClient);
      // Sin toast: al cerrar, la tarjeta muestra el km ya registrado.
      onOpenChange(false);
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const parsed = Number(km);
    // Misma validación que MileageSection (fuente de verdad del detalle).
    if (!km.trim() || Number.isNaN(parsed) || parsed < 0) {
      setFormError("Ingresá un kilometraje válido.");
      return;
    }
    record.mutate(
      { mileage: Math.round(parsed) },
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
            setFormError(
              "No se pudo registrar el kilometraje. Intentalo nuevamente.",
            );
          }
        },
      },
    );
  };

  return (
    <DialogPopup className="sm:max-w-md">
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>

      {/* noValidate: la validación es la misma del detalle y muestra el
          mensaje inline en español (sin burbujas nativas del navegador). */}
      <form
        className="mt-2 flex flex-col gap-4"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="grid gap-1.5">
          <Label htmlFor="mileage-register-km">Kilometraje (km)</Label>
          <Input
            id="mileage-register-km"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            placeholder="Ej. 25000"
            value={km}
            onChange={(event) => setKm(event.target.value)}
            required
          />
        </div>

        {formError && (
          <Callout variant="destructive" role="alert">
            {formError}
          </Callout>
        )}

        {/* Mobile-first: en pantallas chicas el primario queda arriba. */}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={record.isPending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={record.isPending}>
            {record.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {isUpdate ? "Actualizando..." : "Registrando..."}
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </form>
    </DialogPopup>
  );
}
