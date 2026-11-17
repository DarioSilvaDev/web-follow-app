"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useActiveContext } from "@/hooks/use-active-context";
import { getActiveContext } from "@/lib/active-context";
import { invalidateVehicleViews } from "@/lib/query-keys";
import { vehicleApi } from "@/lib/api";
import {
  VehicleCatalogFields,
  VehicleDetailsFields,
  VehicleIdentificationFields,
} from "@/components/vehicle/vehicle-form-fields";
import {
  FormSection,
  FormSectionAccordion,
  type SectionStatus,
} from "@/components/forms/form-section";
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

  // D-07 (Gap 1): in DEALERSHIP "kilometraje inicial" is mandatory (alta de
  // 0 km por concesionaria). D-206: in PERSONAL it is optional ("kilometraje
  // actual") — el usuario está registrando su propio vehículo y conoce el dato.
  const isDealership = activeContext?.type === "DEALERSHIP";

  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  /**
   * Secciones colapsables (mismo patrón que "Nueva atención"). Todas arrancan
   * cerradas; el usuario abre las que necesita. El submit corpora el foco en
   * la sección que falla (ver `onInvalid` / `openSectionById`).
   */
  const [openSection, setOpenSection] = useState<string[]>([]);

  /**
   * PERSONAL (alta self-service): marca, modelo, kilometraje actual, año del
   * modelo y color son obligatorios (solo las notas son opcionales).
   * DEALERSHIP: km inicial obligatorio (D-07); el resto sigue opcional.
   * El schema no conoce el Active Context: se parametriza acá.
   */
  const registerSchema = useMemo(
    () =>
      vehicleFormSchema.superRefine((values, ctx) => {
        if (!values.initialMileage?.trim()) {
          ctx.addIssue({
            code: "custom",
            path: ["initialMileage"],
            message: isDealership
              ? "Ingresá el kilometraje inicial."
              : "Ingresá el kilometraje actual.",
          });
        }
        if (!isDealership) {
          if (!values.modelYear?.trim()) {
            ctx.addIssue({
              code: "custom",
              path: ["modelYear"],
              message: "Ingresá el año del modelo",
            });
          }
          if (!values.color?.trim()) {
            ctx.addIssue({
              code: "custom",
              path: ["color"],
              message: "Ingresá el color",
            });
          }
        }
      }),
    [isDealership],
  );

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(registerSchema),
  });

  // Catalog cascade (D-038): marca → modelo (MVP sin versiones). Brands on
  // mount; models on demand (RF-4).
  const brandsQuery = useQuery({
    queryKey: ["vehicle-brands"],
    queryFn: vehicleApi.listBrands,
  });

  const modelsQuery = useQuery({
    queryKey: ["vehicle-models", selectedBrandId],
    queryFn: () => vehicleApi.listModels(selectedBrandId),
    enabled: selectedBrandId !== "",
  });

  const handleBrandChange = (value: string) => {
    setSelectedBrandId(value);
    setSelectedModelId("");
    setCatalogError(null);
  };

  const handleModelChange = (value: string) => {
    setSelectedModelId(value);
    setCatalogError(null);
  };

  // ── Estado de las secciones (status del acordeón) ────────────────────────
  const plateValue = watch("licensePlate") ?? "";
  const mileageValue = watch("initialMileage") ?? "";
  const modelYearValue = watch("modelYear") ?? "";
  const colorValue = watch("color") ?? "";

  const plateComplete = /^[a-zA-Z0-9]{2,10}$/.test(plateValue.trim());
  const mileageComplete = /^\d+$/.test(mileageValue.trim());
  const modelYearComplete = /^\d{4}$/.test(modelYearValue.trim());
  const colorComplete = colorValue.trim() !== "";
  const catalogComplete = selectedBrandId !== "" && selectedModelId !== "";

  const identificationStatus: SectionStatus = plateComplete
    ? "complete"
    : "incomplete";
  // DEALERSHIP: catálogo estrictamente opcional ("Opcional" o "Completa").
  const catalogStatus: SectionStatus = isDealership
    ? catalogComplete
      ? "complete"
      : "optional"
    : catalogComplete
      ? "complete"
      : "incomplete";
  const detailsComplete = isDealership
    ? mileageComplete
    : mileageComplete && modelYearComplete && colorComplete;
  const detailsStatus: SectionStatus = detailsComplete
    ? "complete"
    : "incomplete";

  /** Abre la sección indicada y cierra las demás (una sola abierta a la vez). */
  const openSectionById = (id: string) => setOpenSection([id]);

  const onInvalid = (formErrors: typeof errors) => {
    const firstField = Object.keys(formErrors)[0];
    const target =
      firstField === "licensePlate" || firstField === "vin"
        ? "identificacion"
        : "detalles";
    openSectionById(target);
  };

  const onSubmit = async (data: VehicleFormValues) => {
    setSubmitError(null);

    // Catálogo: PERSONAL lo exige completo. Si solo se eligió la marca
    // (falta el modelo), el mapper omite el par (D-038) — en PERSONAL el
    // submit se bloquea con mensaje; en DEALERSHIP el par es opcional y viaja
    // junto o no viaja.
    if (!isDealership && !catalogComplete) {
      setCatalogError("Seleccioná la marca y el modelo del vehículo.");
      openSectionById("catalogo");
      return;
    }
    setCatalogError(null);

    try {
      await vehicleApi.registerVehicle(
        toVehicleInput(data, {
          brandId: selectedBrandId,
          modelId: selectedModelId,
        }),
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
          // Llevar la vista a la sección con el error (una sola abierta).
          openSectionById("identificacion");
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
          openSectionById("detalles");
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
        apiError.message ||
          "Error al registrar el vehículo. Intentalo nuevamente.",
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
          Completá los datos del vehículo.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit, onInvalid)}
        noValidate
        className="grid gap-4"
      >
        <FormSectionAccordion
          value={openSection}
          onValueChange={setOpenSection}
        >
          {/* Identificación — patente (y VIN opcional) */}
          <FormSection
            value="identificacion"
            title="Identificación"
            status={identificationStatus}
            description="Patente y, opcionalmente, VIN."
          >
            <VehicleIdentificationFields
              register={register}
              errors={errors}
              vinSlot={
                <div className="grid gap-2">
                  <Label htmlFor="vin">VIN (opcional)</Label>
                  <Input
                    id="vin"
                    className="bg-card"
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
                      <Info
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      Completar el VIN mejora la trazabilidad de la historia del
                      vehículo.
                    </p>
                  )}
                </div>
              }
            />
          </FormSection>

          {/* Catálogo vehicular — PERSONAL exige marca y modelo */}
          <FormSection
            value="catalogo"
            title="Catálogo vehicular"
            status={catalogStatus}
          >
            <VehicleCatalogFields
              catalog={{
                selectedBrandId,
                selectedModelId,
                brands: brandsQuery.data,
                models: modelsQuery.data,
                modelsLoading: modelsQuery.isLoading,
                brandsError: brandsQuery.isError,
                onBrandChange: handleBrandChange,
                onModelChange: handleModelChange,
                description: isDealership
                  ? "Si seleccionás marca y modelo, el vehículo se guarda con esos datos del catálogo."
                  : "Marca y modelo son obligatorios para registrar tu vehículo.",
                errorHint:
                  "No se pudo cargar el catálogo. Podés registrarlo sin marca/modelo.",
                catalogError,
              }}
            />
          </FormSection>

          {/* Detalles — km actual obligatorio; año y color (PERSONAL) */}
          <FormSection value="detalles" title="Detalles" status={detailsStatus}>
            <VehicleDetailsFields
              register={register}
              errors={errors}
              requiredDetailsLabels={!isDealership}
              initialMileageSlot={
                <div className="grid gap-2">
                  <Label htmlFor="initialMileage">
                    {isDealership
                      ? "Kilometraje inicial"
                      : "Kilometraje actual"}
                  </Label>
                  <Input
                    id="initialMileage"
                    className="bg-card"
                    inputMode="numeric"
                    sanitize="digits"
                    placeholder={isDealership ? "Ej. 0" : "Ej. 85000"}
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
                      <Info
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      {isDealership
                        ? "Para altas de 0 km desde una concesionaria. Se registra como el primer kilometraje del vehículo."
                        : "Los kilómetros que marca el tablero hoy. Se guarda como la primera lectura de la historia del vehículo."}
                    </p>
                  )}
                </div>
              }
            />
          </FormSection>
        </FormSectionAccordion>

        {submitError && (
          <Callout variant="destructive" role="alert">
            {submitError}
          </Callout>
        )}

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
      </form>
    </div>
  );
}
