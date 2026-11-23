"use client";

/**
 * Paso 1 — patente (F-1, copy §1.3).
 *
 * Card propia sin stepper (el stepper recién aparece en la verificación).
 * Copy literal §1.3: título/subtítulo estáticos (§0 regla 7: no revela datos
 * del vehículo), label/placeholder/helper/CTA/microcopy. La validación es la
 * del schema `claimPlateSchema` (voseo, §1.3); el error de challenge/verify
 * llega como `error` (§1.6 único o red §1.3) y se muestra en un Callout
 * destructive con la acción `Volver a intentar`.
 */
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Car, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  claimPlateSchema,
  type ClaimPlateValues,
} from "@/lib/vehicle-claim-schema";

export function ClaimStepPlate({
  error,
  loading,
  onClearError,
  onSubmit,
}: {
  /** Error de challenge/red ya resuelto a copy (§1.6 / §1.3). */
  error: string | null;
  loading: boolean;
  onClearError: () => void;
  onSubmit: (licensePlate: string) => void;
}) {
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<ClaimPlateValues>({
    resolver: zodResolver(claimPlateSchema),
    mode: "onSubmit",
  });

  // §5 "Foco al error": foco al primer campo con error de validación.
  useEffect(() => {
    const first = Object.keys(errors)[0];
    if (first) setFocus(first as keyof ClaimPlateValues);
  }, [errors, setFocus]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-full bg-muted p-2">
            <Car className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </span>
          <CardTitle>Reclamá tu vehículo</CardTitle>
        </div>
        <CardDescription>
          Verificá que el vehículo es tuyo y accedé a su historial de atenciones
          en Autentia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((values) => onSubmit(values.licensePlate))}
          className="grid gap-4"
          noValidate
        >
          <div className="grid gap-1.5">
            <Label htmlFor="claim-plate">Patente</Label>
            <Input
              id="claim-plate"
              placeholder="Ej. AB123CD"
              autoComplete="off"
              inputMode="text"
              sanitize="plate"
              maxLength={7}
              aria-invalid={errors.licensePlate ? true : undefined}
              disabled={loading}
              {...register("licensePlate")}
            />
            {errors.licensePlate ? (
              <p className="text-sm text-destructive" role="alert">
                {errors.licensePlate.message}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                La encontrás en la cédula verde o en la patente del vehículo.
              </p>
            )}
          </div>

          {error && (
            <Callout variant="destructive" role="alert">
              <span>{error}</span>
              <button
                type="button"
                onClick={onClearError}
                className="mt-1 block text-sm font-semibold underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                Volver a intentar
              </button>
            </Callout>
          )}

          <div className="grid gap-2">
            <Button type="submit" disabled={loading} aria-busy={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verificando…
                </>
              ) : (
                "Continuar"
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Si no reconocés este vehículo, no continúes.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
