"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useActiveContext } from "@/hooks/use-active-context";
import { getActiveContext } from "@/lib/active-context";
import { invalidateVehicleViews } from "@/lib/query-keys";
import { vehicleApi } from "@/lib/api";
import { VehicleFormFields } from "@/components/vehicle/vehicle-form-fields";
import {
  CONFLICT_MESSAGES,
  conflictField,
  toVehicleInput,
  vehicleFormSchema,
  type VehicleFormValues,
} from "@/app/(dashboard)/vehicles/vehicle-form-schema";

export default function NewVehiclePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refreshSession } = useAuth();
  const activeContext = useActiveContext();

  // D-07 (Gap 1): the "kilometraje inicial" is a DEALERSHIP-only concept
  // (alta de 0 km por concesionaria). In PERSONAL the field is not rendered.
  const isDealership = activeContext?.type === "DEALERSHIP";

  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
  });

  // Catalog cascade (D-038): brands on mount; models/versions on demand (RF-4).
  const brandsQuery = useQuery({
    queryKey: ["vehicle-brands"],
    queryFn: vehicleApi.listBrands,
  });

  const modelsQuery = useQuery({
    queryKey: ["vehicle-models", selectedBrandId],
    queryFn: () => vehicleApi.listModels(selectedBrandId),
    enabled: selectedBrandId !== "",
  });

  const versionsQuery = useQuery({
    queryKey: ["vehicle-versions", selectedModelId],
    queryFn: () => vehicleApi.listVersions(selectedModelId),
    enabled: selectedModelId !== "",
  });

  const handleBrandChange = (value: string) => {
    setSelectedBrandId(value);
    setSelectedModelId("");
    setSelectedVersionId("");
  };

  const handleModelChange = (value: string) => {
    setSelectedModelId(value);
    setSelectedVersionId("");
  };

  const onSubmit = async (data: VehicleFormValues) => {
    setSubmitError(null);

    // D-07: in DEALERSHIP the initial mileage is mandatory. The schema cannot
    // enforce it (it does not know the Active Context), so it is checked here.
    if (isDealership && !data.initialMileage?.trim()) {
      setError("initialMileage", {
        type: "required",
        message: "Ingresá el kilometraje inicial.",
      });
      return;
    }

    try {
      await vehicleApi.registerVehicle(
        toVehicleInput(data, selectedVersionId, isDealership),
      );

      // Contexto activo al momento del éxito (se lee ANTES del refresh de
      // sesión porque `refreshSession` no toca el store de contexto).
      const ctx = getActiveContext();

      // RF-7: force the list to refetch and refresh the session so the
      // dashboard reflects isVehicleOwner. Una sola invalidación cubre TODAS
      // las vistas del conjunto (lista, dashboard, transferencias y la tab
      // Exhibición de la concesionaria), que comparten el namespace
      // `["vehicles"]` (`src/lib/query-keys.ts`, D-TL-19). Antes había que
      // invalidar a mano `["dealership-vehicles", id]` y olvidarla dejaba la
      // exhibición stale.
      invalidateVehicleViews(queryClient);

      try {
        await refreshSession();
      } catch {
        // Best-effort: stale session data is not fatal for the redirect
      }
      // Redirect contextual: con DEALERSHIP activo en el momento del éxito,
      // volver a la concesionaria (el vehículo quedó a su nombre, D-07);
      // en PERSONAL (o sin contexto) → /vehicles (comportamiento previo).
      router.push(
        ctx?.type === "DEALERSHIP"
          ? `/dealerships/${ctx.dealershipId}`
          : "/vehicles",
      );
    } catch (error) {
      const apiError = error as {
        status?: number;
        message?: string;
        code?: string;
      };

      // RF-6: 409 → clear field-level message, form values are preserved.
      if (apiError.status === 409) {
        const field = conflictField(apiError.message);
        if (field === "licensePlate" || field === "vin") {
          setError(field, {
            type: "conflict",
            message: CONFLICT_MESSAGES[field],
          });
        } else if (field === "engineNumber") {
          // Field not present in the MVP form; surface as a general error.
          setSubmitError(CONFLICT_MESSAGES.engineNumber);
        } else {
          setSubmitError(
            apiError.message ||
              "Ya existe un vehículo registrado con esos datos.",
          );
        }
        return;
      }

      // D-07: a rejection mentioning the mileage is surfaced on that field.
      if (apiError.status === 400) {
        const message = apiError.message ?? "";
        if (/kilo|mileage|initialMileage/i.test(message)) {
          setError("initialMileage", {
            type: "server",
            message: message || "Kilometraje inicial inválido.",
          });
          return;
        }
        setSubmitError(message || "Datos inválidos. Revisá el formulario.");
        return;
      }

      if (apiError.status === 401) {
        setSubmitError("Tu sesión expiró. Iniciá sesión nuevamente.");
        return;
      }

      if (apiError.status && apiError.status >= 500) {
        setSubmitError("Error interno del servidor. Intentalo nuevamente.");
        return;
      }

      setSubmitError(
        apiError.message || "Error al registrar el vehículo. Intentalo nuevamente.",
      );
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <Link
          href="/vehicles"
          className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Volver a mis vehículos
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          Registrar vehículo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Completá los datos del vehículo. Los campos opcionales pueden dejarse
          vacíos.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="grid gap-4">
            <VehicleFormFields
              register={register}
              errors={errors}
              submitError={submitError}
              vinSlot={
                <div className="grid gap-2">
                  <Label htmlFor="vin">VIN (opcional)</Label>
                  <Input
                    id="vin"
                    placeholder="Número de chasis"
                    autoComplete="off"
                    aria-invalid={!!errors.vin}
                    {...register("vin")}
                  />
                  {errors.vin ? (
                    <p className="text-sm text-destructive" role="alert">
                      {errors.vin.message}
                    </p>
                  ) : (
                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Completar el VIN mejora la trazabilidad de la historia del
                      vehículo.
                    </p>
                  )}
                </div>
              }
              initialMileageSlot={
                isDealership ? (
                  <div className="grid gap-2">
                    <Label htmlFor="initialMileage">Kilometraje inicial</Label>
                    <Input
                      id="initialMileage"
                      inputMode="numeric"
                      placeholder="Ej. 0"
                      autoComplete="off"
                      aria-invalid={!!errors.initialMileage}
                      {...register("initialMileage")}
                    />
                    {errors.initialMileage ? (
                      <p className="text-sm text-destructive" role="alert">
                        {errors.initialMileage.message}
                      </p>
                    ) : (
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Para altas de 0 km desde una concesionaria. Se registra
                        como el primer kilometraje del vehículo.
                      </p>
                    )}
                  </div>
                ) : undefined
              }
              catalog={{
                selectedBrandId,
                selectedModelId,
                selectedVersionId,
                brands: brandsQuery.data,
                models: modelsQuery.data,
                versions: versionsQuery.data,
                modelsLoading: modelsQuery.isLoading,
                versionsLoading: versionsQuery.isLoading,
                brandsError: brandsQuery.isError,
                onBrandChange: handleBrandChange,
                onModelChange: handleModelChange,
                onVersionChange: (value) => setSelectedVersionId(value),
                description:
                  "Si seleccionás marca, modelo y versión, el vehículo se guarda con esos datos del catálogo.",
                errorHint:
                  "No se pudo cargar el catálogo. Podés registrarlo sin marca/modelo/versión.",
              }}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Registrando...
                </>
              ) : (
                "Registrar vehículo"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
