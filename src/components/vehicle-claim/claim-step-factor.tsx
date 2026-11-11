"use client";

/**
 * Contenido de verificación (F-1): el challenge decide el factor.
 *
 * - `vin` → §1.4 input de últimos 4 del VIN (helper sólo si no hay error).
 * - `mileage` → §1.5 radiogroup de rangos + helper "No lo sé".
 *
 * El título/subtítulo los pinta el `ClaimWizard` (patrón InvitationWizard).
 * Copy literal §1.4/§1.5. El spec §5 pide `aria-checked` pero §1.5 nota que
 * no existe componente de radio y resuelve con botones seleccionables
 * (`Button` con `variant` alternada + `aria-pressed`) — se sigue §1.5 (la
 * nota es más específica; ver flag en el reporte). El fallo de verify llega
 * como `error` (§1.6 único) con la acción `Volver a intentar`.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClaimChallenge } from "@/types/vehicle-claim";
import { CLAIM_MILEAGE_REQUIRED_ERROR } from "@/lib/vehicle-claim-schema";

export function ClaimStepFactor({
  challenge,
  error,
  loading,
  onClearError,
  onVerify,
  onBack,
}: {
  challenge: ClaimChallenge;
  /** Error de verify ya resuelto a copy (§1.6 / red §1.3). */
  error: string | null;
  loading: boolean;
  onClearError: () => void;
  onVerify: (input: { vinLast4?: string; mileageRangeId?: string }) => void;
  onBack: () => void;
}) {
  const [vin, setVin] = useState("");
  const [rangeId, setRangeId] = useState<string | null>(null);
  const [vinError, setVinError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const vinRef = useRef<HTMLInputElement>(null);

  // Foco al primer campo con error (§5) cuando el factor es VIN.
  useEffect(() => {
    if (vinError) vinRef.current?.focus();
  }, [vinError]);

  const isVin = challenge.factor === "vin";

  const submitVin = () => {
    const value = vin.trim();
    if (!value) {
      setVinError("Ingresá los últimos 4 caracteres del VIN.");
      return;
    }
    if (value.length !== 4) {
      setVinError("El VIN tiene que tener 4 caracteres.");
      return;
    }
    setVinError(null);
    onVerify({ vinLast4: value });
  };

  const submitMileage = () => {
    if (!rangeId) {
      setRangeError(CLAIM_MILEAGE_REQUIRED_ERROR);
      return;
    }
    setRangeError(null);
    onVerify({ mileageRangeId: rangeId });
  };

  return (
    <div className="grid gap-4">
      {isVin ? (
        <div className="grid gap-1.5">
          <Label htmlFor="claim-vin">Últimos 4 del VIN</Label>
          <Input
            id="claim-vin"
            ref={vinRef}
            placeholder="Ej. 1234"
            autoComplete="off"
            inputMode="numeric"
            maxLength={4}
            aria-invalid={vinError ? true : undefined}
            aria-describedby="claim-vin-helper"
            disabled={loading}
            value={vin}
            onChange={(event) => {
              setVin(event.target.value);
              if (vinError) setVinError(null);
            }}
          />
          {vinError ? (
            <p className="text-sm text-destructive" role="alert">
              {vinError}
            </p>
          ) : (
            <p id="claim-vin-helper" className="text-xs text-muted-foreground">
              El VIN está en la cédula verde y en el parabrisas. Ingresá los
              últimos 4 caracteres.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-1.5">
          <div
            role="radiogroup"
            aria-label="Rangos de kilometraje"
            className="grid gap-2 sm:grid-cols-2"
          >
            {challenge.options.map((option) => {
              const selected = rangeId === option.id;
              return (
                <Button
                  key={option.id}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  aria-pressed={selected}
                  disabled={loading}
                  onClick={() => {
                    setRangeId(option.id);
                    if (rangeError) setRangeError(null);
                  }}
                  className="justify-start text-left"
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
          {rangeError ? (
            <p className="text-sm text-destructive" role="alert">
              {rangeError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Si no estás seguro, elegí &quot;No lo sé&quot;. Un especialista va
              a revisar tu reclamo.
            </p>
          )}
        </div>
      )}

      {error && (
        <Callout variant="destructive" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={onClearError}
            className="mt-1 block rounded-sm text-sm font-semibold underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Volver a intentar
          </button>
        </Callout>
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          disabled={loading}
          aria-busy={loading}
          onClick={() => (isVin ? submitVin() : submitMileage())}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Verificando…
            </>
          ) : (
            "Verificar"
          )}
        </Button>
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="self-center rounded-sm text-sm text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Volver
        </button>
      </div>
    </div>
  );
}
