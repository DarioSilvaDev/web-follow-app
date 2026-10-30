"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Info, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CorrectVinDialog } from "@/components/vehicle/correct-vin-dialog";
import { VehicleFormFields } from "@/components/vehicle/vehicle-form-fields";
import { vehicleApi } from "@/lib/api";
import { invalidateVehicleViews, vehicleKeys } from "@/lib/query-keys";
import { VIN_CORRECTION_ENABLED } from "@/lib/feature-flags";
import {
  CONFLICT_MESSAGES,
  conflictField,
  editVehicleFormSchema,
  toEditVehicleInput,
  vehicleToFormValues,
  type EditVehicleFormValues,
} from "@/app/(dashboard)/vehicles/vehicle-form-schema";

/** Banner transitorio inline (sin toast, patrón paneles del repo). */
const BANNER_DURATION_MS = 4000;

/** Read the API error status (apiClient throws { status, message, code }). */
function errorStatus(error: unknown): number | undefined {
  return (error as { status?: number }).status;
}

export default function EditVehiclePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [correctVinOpen, setCorrectVinOpen] = useState(false);
  const [correctVinError, setCorrectVinError] = useState<string | null>(null);

  // Banner transitorio — se auto-oculta tras BANNER_DURATION_MS.
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), BANNER_DURATION_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  // RF-5: once the prefilled catalog cascade is resolved, user edits take over.
  const prefillDoneRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Pre-carga (RF-5): GET /api/vehicles/:id → VehicleResponseDto desnormalizado.
  // retry:false — un 404/403 nunca se resuelve reejecutando la query.
  // ---------------------------------------------------------------------------
  const vehicleQuery = useQuery({
    queryKey: vehicleKeys.detail(id),
    queryFn: () => vehicleApi.getVehicle(id),
    retry: false,
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditVehicleFormValues>({
    resolver: zodResolver(editVehicleFormSchema),
  });

  // Prefill text fields once the vehicle is loaded (RF-5).
  useEffect(() => {
    if (vehicleQuery.data) {
      reset(vehicleToFormValues(vehicleQuery.data));
    }
  }, [vehicleQuery.data, reset]);

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

  // ---------------------------------------------------------------------------
  // Pre-selección de la cascada a partir del detalle desnormalizado (RF-5).
  // El backend NO expone brandId/modelId en VehicleResponseDto, solo los nombres
  // (brand/model/version) + versionId. Por eso emparejamos por nombre, con
  // fallback a "Seleccionar" si el catálogo cambió y ya no matchea.
  // ---------------------------------------------------------------------------
  const vehicle = vehicleQuery.data;

  useEffect(() => {
    if (!vehicle || prefillDoneRef.current) return;
    // Sin catálogo → no hay nada que preseleccionar (D-038).
    if (vehicle.versionId == null) {
      prefillDoneRef.current = true;
      return;
    }
    if (!selectedBrandId && brandsQuery.data) {
      const brand = brandsQuery.data.find(
        (b) => b.name.toLowerCase() === vehicle.brand?.toLowerCase(),
      );
      if (brand) setSelectedBrandId(brand.id);
    }
  }, [vehicle, brandsQuery.data, selectedBrandId]);

  useEffect(() => {
    if (!vehicle || prefillDoneRef.current) return;
    if (!selectedBrandId || selectedModelId || !modelsQuery.data) return;
    const model = modelsQuery.data.find(
      (m) => m.name.toLowerCase() === vehicle.model?.toLowerCase(),
    );
    if (model) setSelectedModelId(model.id);
  }, [vehicle, selectedBrandId, modelsQuery.data, selectedModelId]);

  useEffect(() => {
    if (!vehicle || prefillDoneRef.current) return;
    if (!selectedModelId || selectedVersionId || !versionsQuery.data) return;
    const version =
      versionsQuery.data.find((v) => v.id === vehicle.versionId) ??
      versionsQuery.data.find(
        (v) => v.name.toLowerCase() === vehicle.version?.toLowerCase(),
      );
    if (version) {
      setSelectedVersionId(version.id);
      prefillDoneRef.current = true;
    }
  }, [vehicle, selectedModelId, versionsQuery.data, selectedVersionId]);

  const handleBrandChange = (value: string) => {
    setSelectedBrandId(value);
    setSelectedModelId("");
    setSelectedVersionId("");
  };

  const handleModelChange = (value: string) => {
    setSelectedModelId(value);
    setSelectedVersionId("");
  };

  const onSubmit = async (data: EditVehicleFormValues) => {
    setSubmitError(null);
    // El form solo se renderiza con la precarga resuelta (RF-5); guard defensivo.
    if (!vehicleQuery.data) return;
    try {
      // D-040/D-043 (RF-8): PATCH parcial. toEditVehicleInput compara con el
      // prefill — opcionales vaciados → null explícito; ya vacíos → omitidos;
      // con valor → valor. versionId solo viaja si cambió (NUNCA null, RF-2).
      await vehicleApi.updateVehicle(
        id,
        toEditVehicleInput(vehicleQuery.data, data, selectedVersionId),
      );

      // RF-7: invalidar el listado y el detalle, y redirigir al detalle.
      invalidateVehicleViews(queryClient);
      queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(id) });
      router.push(`/vehicles/${id}`);
    } catch (error) {
      const apiError = error as {
        status?: number;
        message?: string;
        code?: string;
      };

      // RF-6/D-041: 409 → mensaje junto al campo (placa) o general; los valores
      // del formulario se conservan. Este formulario ya NO envía `vin` (D-03),
      // así que un 409 de VIN se surfacea como error general.
      if (apiError.status === 409) {
        const field = conflictField(apiError.message);
        if (field === "licensePlate") {
          setError("licensePlate", {
            type: "conflict",
            message: CONFLICT_MESSAGES.licensePlate,
          });
        } else if (field === "vin") {
          setSubmitError(CONFLICT_MESSAGES.vin);
        } else if (field === "engineNumber") {
          setSubmitError(CONFLICT_MESSAGES.engineNumber);
        } else {
          setSubmitError(
            apiError.message ||
              "Ya existe un vehículo registrado con esos datos.",
          );
        }
        return;
      }

      if (apiError.status === 403) {
        setSubmitError("No tenés permiso para editar este vehículo.");
        return;
      }

      if (apiError.status === 401) {
        setSubmitError("Tu sesión expiró. Iniciá sesión nuevamente.");
        return;
      }

      if (apiError.status === 404) {
        setSubmitError("El vehículo no existe.");
        return;
      }

      if (apiError.status && apiError.status >= 500) {
        setSubmitError("Error interno del servidor. Intentalo nuevamente.");
        return;
      }

      setSubmitError(
        apiError.message || "Error al editar el vehículo. Intentalo nuevamente.",
      );
    }
  };

  // ---------------------------------------------------------------------------
  // D-03 (Gap 1): corrección de VIN como comando auditado aparte. Gateado por
  // feature flag (endpoint backend Bloque B) + capability del vehículo.
  // ---------------------------------------------------------------------------
  const canCorrectVin =
    VIN_CORRECTION_ENABLED && vehicle?.capabilities?.canCorrectVin === true;

  const correctVinMutation = useMutation({
    mutationFn: ({ vin, reason }: { vin: string; reason: string }) =>
      vehicleApi.correctVin(id, { vin, reason }),
    onSuccess: () => {
      setCorrectVinOpen(false);
      setCorrectVinError(null);
      setBanner("VIN corregido.");
      queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(id) });
      invalidateVehicleViews(queryClient);
    },
    onError: (error) => {
      const apiError = error as { status?: number; message?: string };
      if (apiError.status === 409) {
        setCorrectVinError("Ya existe un vehículo registrado con ese VIN.");
        return;
      }
      if (apiError.status === 403) {
        setCorrectVinError("No tenés permiso para corregir el VIN.");
        return;
      }
      if (apiError.status && apiError.status >= 500) {
        setCorrectVinError(
          "Error interno del servidor. Intentalo nuevamente.",
        );
        return;
      }
      setCorrectVinError(
        apiError.message || "No se pudo corregir el VIN. Intentalo nuevamente.",
      );
    },
  });

  const handleCorrectVin = (vin: string, reason: string) => {
    setCorrectVinError(null);
    correctVinMutation.mutate({ vin, reason });
  };

  // Loading (precarga del form).
  if (vehicleQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // RF-6: error de precarga.
  if (vehicleQuery.isError) {
    const status = errorStatus(vehicleQuery.error);
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <Card>
          <CardContent className="py-8 text-center">
            {status === 404 ? (
              <>
                <p className="text-lg font-semibold">Vehículo no encontrado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  El vehículo que intentás editar no existe o fue eliminado.
                </p>
              </>
            ) : status === 403 ? (
              <>
                <p className="text-lg font-semibold">
                  No tenés permiso para editar este vehículo
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Solo el propietario puede editar un vehículo en MVP (D-039).
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">
                  No se pudo cargar el vehículo
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ocurrió un error al consultar el vehículo. Intentalo
                  nuevamente.
                </p>
              </>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/vehicles">
                <Button variant="outline">Volver a mis vehículos</Button>
              </Link>
              {status !== 404 && status !== 403 && (
                <Button onClick={() => vehicleQuery.refetch()}>
                  Reintentar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <Link
          href="/vehicles"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a mis vehículos
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          Editar vehículo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Corregí los datos del vehículo. Solo el propietario puede editar.
        </p>
      </div>

      {banner && (
        <p
          role="status"
          className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground"
        >
          {banner}
        </p>
      )}

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="grid gap-4">
            <VehicleFormFields
              register={register}
              errors={errors}
              submitError={submitError}
              vinSlot={
                <div className="grid gap-2">
                  <Label htmlFor="vin">VIN</Label>
                  <div className="flex gap-2">
                    <Input
                      id="vin"
                      value={vehicleQuery.data?.vin ?? ""}
                      readOnly
                      placeholder="Sin VIN registrado"
                      className="flex-1"
                    />
                    {canCorrectVin && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCorrectVinOpen(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Corregir VIN
                      </Button>
                    )}
                  </div>
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {canCorrectVin
                      ? "El VIN no se edita directamente: usá “Corregir VIN” (queda auditado)."
                      : "El VIN se asigna en el alta y no se edita desde este formulario."}
                  </p>
                </div>
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
                  "Si no se modifica, se mantiene la versión del catálogo actual. Si se vacía, la versión existente no se borra.",
                errorHint:
                  "No se pudo cargar el catálogo. Podés guardar sin marca/modelo/versión.",
              }}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {canCorrectVin && (
        <CorrectVinDialog
          open={correctVinOpen}
          onOpenChange={(open) => {
            setCorrectVinOpen(open);
            if (!open) setCorrectVinError(null);
          }}
          currentVin={vehicleQuery.data?.vin}
          isPending={correctVinMutation.isPending}
          dialogError={correctVinError}
          onConfirm={handleCorrectVin}
        />
      )}
    </div>
  );
}