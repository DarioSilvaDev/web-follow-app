"use client";

/**
 * Campos compartidos del formulario de vehículos (alta F-010 / edición F-011).
 *
 * Extraído de new/page.tsx y [id]/edit/page.tsx, donde ~90% del JSX estaba
 * duplicado. Cada page conserva su lógica (queries del catálogo, prefill de
 * la edición, submit y mapeo de errores); este componente sólo concentra la
 * presentación de los campos comunes, agrupados en secciones visuales
 * (Identificación / Catálogo vehicular / Detalles). Los bloques específicos —
 * VIN editable en el alta vs. VIN read-only con corrección auditada en la
 * edición, y el kilometraje inicial de concesionaria — se inyectan como slots.
 */

import type { ReactNode } from "react";
import type {
  FieldErrors,
  FieldValues,
  Path,
  UseFormRegister,
} from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface CatalogOption {
  id: string;
  name: string;
}

export interface CatalogCascadeProps {
  selectedBrandId: string;
  selectedModelId: string;
  selectedVersionId: string;
  brands?: CatalogOption[];
  models?: CatalogOption[];
  versions?: CatalogOption[];
  modelsLoading: boolean;
  versionsLoading: boolean;
  brandsError: boolean;
  onBrandChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onVersionChange: (value: string) => void;
  /** Copy contextual: qué implica no tocar el catálogo en este flujo. */
  description: string;
  /** Copy contextual del mensaje cuando falla la carga del catálogo. */
  errorHint: string;
}

interface VehicleFormFieldsProps<T extends FieldValues> {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  /** Slot del campo VIN (editable en el alta / read-only + corrección en edición). */
  vinSlot: ReactNode;
  /** Slot del kilometraje inicial (solo alta en contexto DEALERSHIP, D-07). */
  initialMileageSlot?: ReactNode;
  catalog: CatalogCascadeProps;
  /** Error de submit no ligado a un campo (se muestra con role="alert"). */
  submitError?: string | null;
}

function SectionLegend({ children }: { children: ReactNode }) {
  return (
    <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </legend>
  );
}

function SectionFieldset({
  legend,
  children,
}: {
  legend: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="grid gap-2 rounded-lg border border-border/60 p-3">
      <SectionLegend>{legend}</SectionLegend>
      {children}
    </fieldset>
  );
}

export function VehicleFormFields<T extends FieldValues>({
  register,
  errors,
  vinSlot,
  initialMileageSlot,
  catalog,
  submitError,
}: VehicleFormFieldsProps<T>) {
  return (
    <>
      <SectionFieldset legend="Identificación">
        <div className="grid gap-2">
          <Label htmlFor="licensePlate">Placa</Label>
          <Input
            id="licensePlate"
            placeholder="Ej. ABC123"
            maxLength={10}
            autoComplete="off"
            aria-invalid={!!errors.licensePlate}
            {...register("licensePlate" as Path<T>)}
          />
          {errors.licensePlate && (
            <p className="text-sm text-destructive" role="alert">
              {errors.licensePlate.message as string}
            </p>
          )}
        </div>

        {vinSlot}
      </SectionFieldset>

      <SectionFieldset legend="Catálogo vehicular (opcional)">
        <p className="text-xs text-muted-foreground">{catalog.description}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="brand">Marca</Label>
            <Select
              id="brand"
              value={catalog.selectedBrandId}
              onChange={(event) => catalog.onBrandChange(event.target.value)}
            >
              <option value="">Seleccionar</option>
              {catalog.brands?.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
            {catalog.brandsError && (
              <p className="text-xs text-muted-foreground" role="alert">
                {catalog.errorHint}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="model">Modelo</Label>
            <Select
              id="model"
              value={catalog.selectedModelId}
              onChange={(event) => catalog.onModelChange(event.target.value)}
              disabled={!catalog.selectedBrandId || catalog.modelsLoading}
            >
              <option value="">
                {catalog.modelsLoading ? "Cargando..." : "Seleccionar"}
              </option>
              {catalog.models?.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="version">Versión</Label>
            <Select
              id="version"
              value={catalog.selectedVersionId}
              onChange={(event) => catalog.onVersionChange(event.target.value)}
              disabled={!catalog.selectedModelId || catalog.versionsLoading}
            >
              <option value="">
                {catalog.versionsLoading ? "Cargando..." : "Seleccionar"}
              </option>
              {catalog.versions?.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </SectionFieldset>

      <SectionFieldset legend="Detalles (opcional)">
        {initialMileageSlot}

        <div className="grid gap-2">
          <Label htmlFor="modelYear">Año del modelo (opcional)</Label>
          <Input
            id="modelYear"
            inputMode="numeric"
            placeholder="Ej. 2021"
            maxLength={4}
            autoComplete="off"
            aria-invalid={!!errors.modelYear}
            {...register("modelYear" as Path<T>)}
          />
          {errors.modelYear && (
            <p className="text-sm text-destructive" role="alert">
              {errors.modelYear.message as string}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="color">Color (opcional)</Label>
          <Input
            id="color"
            placeholder="Ej. Rojo"
            autoComplete="off"
            {...register("color" as Path<T>)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea
            id="notes"
            placeholder="Observaciones adicionales..."
            rows={3}
            {...register("notes" as Path<T>)}
          />
        </div>
      </SectionFieldset>

      {submitError && (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      )}
    </>
  );
}
