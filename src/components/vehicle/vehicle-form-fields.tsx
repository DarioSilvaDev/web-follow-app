"use client";

/**
 * Campos compartidos del formulario de vehículos (alta F-010 / edición F-011).
 *
 * Extraído de new/page.tsx y [id]/edit/page.tsx, donde ~90% del JSX estaba
 * duplicado. Cada page conserva su lógica (queries del catálogo, prefill de
 * la edición, submit y mapeo de errores); este componente solo concentra la
 * presentación de los campos comunes, agrupados en secciones visuales
 * (Identificación / Catálogo vehicular / Detalles). El catálogo es
 * marca → modelo: en MVP NO se usan versiones de vehículo. Los bloques
 * específicos —
 * VIN editable en el alta vs. VIN read-only con corrección auditada en la
 * edición, y el kilometraje (obligatorio en concesionaria / opcional para el
 * propietario, D-206) — se inyectan como slots.
 *
 * Las sub-secciones (`VehicleIdentificationFields`, `VehicleCatalogFields`,
 * `VehicleDetailsFields`) se exportan por separado para páginas que quieran
 * ordenar los campos en su propio contenedor (p. ej. el alta usa el acordeón
 * `FormSection`); cada una renderiza SOLO el contenido (sin chrome de
 * fieldset). `VehicleFormFields` compone las tres dentro de los fieldsets
 * clásicos (lo usa la edición).
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
  brands?: CatalogOption[];
  models?: CatalogOption[];
  modelsLoading: boolean;
  brandsError: boolean;
  onBrandChange: (value: string) => void;
  onModelChange: (value: string) => void;
  /** Copy contextual: qué implica no tocar el catálogo en este flujo. */
  description: string;
  /** Copy contextual del mensaje cuando falla la carga del catálogo. */
  errorHint: string;
  /** Error de submit por catálogo incompleto (p. ej. alta PERSONAL). */
  catalogError?: string | null;
}

interface VehicleFormFieldsProps<T extends FieldValues> {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  /** Slot del campo VIN (editable en el alta / read-only + corrección en edición). */
  vinSlot: ReactNode;
  /** Slot del kilometraje (obligatorio en DEALERSHIP; opcional en PERSONAL, D-206). */
  initialMileageSlot?: ReactNode;
  catalog: CatalogCascadeProps;
  /** Error de submit no ligado a un campo (se muestra con role="alert"). */
  submitError?: string | null;
  /**
   * Labels de año/color sin la aclaración "(opcional)" (alta PERSONAL,
   * donde año de modelo y color son obligatorios).
   */
  requiredDetailsLabels?: boolean;
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

/** Patente + VIN (slot). Sin contenedor: la página decide el chrome. */
export function VehicleIdentificationFields<T extends FieldValues>({
  register,
  errors,
  vinSlot,
}: Pick<VehicleFormFieldsProps<T>, "register" | "errors" | "vinSlot">) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="licensePlate">Patente</Label>
        <Input
          id="licensePlate"
          className="bg-card"
          placeholder="Ej. ABC123"
          sanitize="plate"
          maxLength={7}
          autoComplete="off"
          aria-invalid={!!errors.licensePlate}
          {...register("licensePlate" as Path<T>)}
        />
        {errors.licensePlate ? (
          <p className="text-sm text-destructive" role="alert">
            {errors.licensePlate.message as string}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Formato: AAA111 (vieja) o AA111AA (nueva).
          </p>
        )}
      </div>

      {vinSlot}
    </>
  );
}

/** Cascada marca → modelo + error de submit por catálogo incompleto. */
export function VehicleCatalogFields({ catalog }: { catalog: CatalogCascadeProps }) {
  return (
    <>
      <p className="text-xs text-muted-foreground">{catalog.description}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="brand">Marca</Label>
          <Select
            id="brand"
            className="bg-card"
            value={catalog.selectedBrandId}
            aria-invalid={!!catalog.catalogError}
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
            className="bg-card"
            value={catalog.selectedModelId}
            aria-invalid={!!catalog.catalogError}
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
      </div>
      {catalog.catalogError && (
        <p className="text-sm text-destructive" role="alert">
          {catalog.catalogError}
        </p>
      )}
    </>
  );
}

/** Kilometraje (slot) + año/color + notas. Sin contenedor. */
export function VehicleDetailsFields<T extends FieldValues>({
  register,
  errors,
  initialMileageSlot,
  requiredDetailsLabels = false,
}: Pick<
  VehicleFormFieldsProps<T>,
  "register" | "errors" | "initialMileageSlot" | "requiredDetailsLabels"
>) {
  return (
    <>
      {initialMileageSlot}

      <div className="grid gap-2">
        <Label htmlFor="modelYear">
          {requiredDetailsLabels ? "Año del modelo" : "Año del modelo (opcional)"}
        </Label>
        <Input
          id="modelYear"
          className="bg-card"
          inputMode="numeric"
          sanitize="digits"
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
        <Label htmlFor="color">
          {requiredDetailsLabels ? "Color" : "Color (opcional)"}
        </Label>
        <Input
          id="color"
          className="bg-card"
          placeholder="Ej. Rojo"
          autoComplete="off"
          aria-invalid={!!errors.color}
          {...register("color" as Path<T>)}
        />
        {errors.color && (
          <p className="text-sm text-destructive" role="alert">
            {errors.color.message as string}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea
          id="notes"
          className="bg-card"
          placeholder="Observaciones adicionales..."
          rows={3}
          {...register("notes" as Path<T>)}
        />
      </div>
    </>
  );
}

export function VehicleFormFields<T extends FieldValues>({
  register,
  errors,
  vinSlot,
  initialMileageSlot,
  catalog,
  submitError,
  requiredDetailsLabels = false,
}: VehicleFormFieldsProps<T>) {
  return (
    <>
      <SectionFieldset legend="Identificación">
        <VehicleIdentificationFields
          register={register}
          errors={errors}
          vinSlot={vinSlot}
        />
      </SectionFieldset>

      <SectionFieldset legend="Catálogo vehicular (opcional)">
        <VehicleCatalogFields catalog={catalog} />
      </SectionFieldset>

      <SectionFieldset legend="Detalles (opcional)">
        <VehicleDetailsFields
          register={register}
          errors={errors}
          initialMileageSlot={initialMileageSlot}
          requiredDetailsLabels={requiredDetailsLabels}
        />
      </SectionFieldset>

      {submitError && (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      )}
    </>
  );
}
