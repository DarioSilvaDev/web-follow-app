"use client";

/**
 * Dialog de corrección de VIN (D-03, Gap 1).
 *
 * El VIN ya NO se edita por PATCH: el backend lo rechaza (`@IsEmpty()`) y la
 * corrección es un comando auditado aparte
 * (`POST /vehicles/:id/vin-correction`, requiere `reason` para el
 * VehicleAuditLog). Este componente es PRESENTACIONAL: el padre decide
 * apertura/cierre, ejecuta la mutación, y provee `isPending` / `dialogError`
 * para reintento dentro del dialog (mismo contrato que
 * `AdminStatusChangeDialog`).
 *
 * Validación local con la regla FORMATO compartida (`@/lib/vin`, D-145) para
 * dar feedback inmediato; el backend sigue siendo la autoridad. El bloque se
 * muestra solo cuando `VIN_CORRECTION_ENABLED` es true (ver feature-flags).
 *
 * El cuerpo del formulario se monta solo mientras el dialog está abierto, así
 * un nuevo intento siempre arranca con estado limpio (sin efectos de reset).
 */
import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { isValidVin, normalizeVin } from "@/lib/vin";

export interface CorrectVinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** VIN actual, mostrado como referencia (puede ser null/""). */
  currentVin?: string | null;
  isPending: boolean;
  /** Error persistente para reintento (se muestra dentro del dialog). */
  dialogError?: string | null;
  onConfirm: (vin: string, reason: string) => void;
}

export function CorrectVinDialog({
  open,
  onOpenChange,
  currentVin,
  isPending,
  dialogError = null,
  onConfirm,
}: CorrectVinDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <CorrectVinDialogBody
          currentVin={currentVin}
          isPending={isPending}
          dialogError={dialogError}
          onConfirm={onConfirm}
        />
      ) : null}
    </Dialog>
  );
}

type CorrectVinDialogBodyProps = Omit<
  CorrectVinDialogProps,
  "open" | "onOpenChange"
>;

/**
 * El submit falla la validación hasta que el VIN respeta la regla de formato y
 * el motivo no está vacío.
 */
function CorrectVinDialogBody({
  currentVin,
  isPending,
  dialogError,
  onConfirm,
}: CorrectVinDialogBodyProps) {
  const [vin, setVin] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  const vinError =
    touched && vin.trim() !== "" && !isValidVin(vin)
      ? "El VIN debe tener 17 caracteres válidos (sin I, O ni Q)."
      : undefined;
  const reasonError =
    touched && reason.trim() === "" ? "Ingresá el motivo de la corrección." : undefined;
  const canSubmit =
    vin.trim() !== "" && isValidVin(vin) && reason.trim() !== "";

  const handleSubmit = () => {
    setTouched(true);
    if (!canSubmit || isPending) return;
    onConfirm(normalizeVin(vin), reason.trim());
  };

  return (
    <DialogPopup className="sm:max-w-md">
      <DialogTitle>Corregir VIN</DialogTitle>
      <DialogDescription>
        La corrección del VIN queda registrada en la auditoría del vehículo.
      </DialogDescription>

      <div className="mt-2 grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="current-vin">VIN actual</Label>
          <Input id="current-vin" value={currentVin ?? ""} readOnly />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="new-vin">Nuevo VIN</Label>
          <Input
            id="new-vin"
            placeholder="17 caracteres"
            autoComplete="off"
            maxLength={17}
            aria-invalid={!!vinError}
            value={vin}
            onChange={(event) => setVin(event.target.value)}
          />
          {vinError && (
            <p className="text-sm text-destructive" role="alert">
              {vinError}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="vin-reason">Motivo</Label>
          <Input
            id="vin-reason"
            placeholder="Ej. Error de tipeo en el alta"
            autoComplete="off"
            aria-invalid={!!reasonError}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {reasonError && (
            <p className="text-sm text-destructive" role="alert">
              {reasonError}
            </p>
          )}
        </div>

        {dialogError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {dialogError}
          </p>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <DialogClose render={<Button variant="outline" disabled={isPending} />}>
          Cancelar
        </DialogClose>
        <Button disabled={isPending} onClick={handleSubmit}>
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Corregir VIN
        </Button>
      </div>
    </DialogPopup>
  );
}
