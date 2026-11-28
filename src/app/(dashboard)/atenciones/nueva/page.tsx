"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, type FieldErrors, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowLeft,
  CarFront,
  Check,
  CheckCircle2,
  Eye,
  Gauge,
  ImagePlus,
  Info,
  Loader2,
  Search,
  Smartphone,
} from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  FormSection,
  FormSectionAccordion,
  type SectionStatus,
} from "@/components/forms/form-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentsUploader } from "@/components/care-episode/attachments-uploader";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import { careEpisodeApi, vehicleApi, workshopApi } from "@/lib/api";
import {
  CHECK_IN_MESSAGES,
  resolveCheckInError,
  resolveLookupErrorMessage,
  type CheckInErrorField,
} from "@/lib/check-in-errors";
import {
  LICENSE_PLATE_FORMAT_ERROR,
  isValidLicensePlate,
} from "@/lib/license-plate";
import { isValidVin, normalizeVin } from "@/lib/vin";
import type {
  CareEpisodeAttachment,
  CareEpisodeLookupVehicle,
  CheckInInput,
  CheckInResult,
  ServiceType,
} from "@/types/care-episode";
import type { VehicleBrand, VehicleModel } from "@/types/vehicle";

// ---------------------------------------------------------------------------
// B-2 — "Nueva atención" (check-in unificado de taller).
//
// Journey: buscar patente → si existe, confirmar y continuar; si no existe, el
// backend la registra como vehículo nuevo. En ambos casos se envía
// `POST /api/care-episodes/check-in` con la PATENTE (no `vehicleId`).
//
// El endpoint viejo (`POST /care-episodes`) NO se usa acá: el server resuelve
// reutilización/creación en una transacción y devuelve `vehicleCreated`, que es
// la fuente de verdad del mensaje de éxito.
//
// WORKSHOP-only: sin taller seleccionado la página solo orienta (el backend
// responde 403 en PERSONAL, D-024 A2 / D-035).
// ---------------------------------------------------------------------------

type LookupState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "found"; plate: string; vehicle: CareEpisodeLookupVehicle }
  | { status: "not-found"; plate: string }
  | { status: "error"; message: string; detail?: string };

/** Opción "Otra marca" / "Otro modelo" de los selects de catálogo. */
const OTHER_OPTION = "__other__";
const MAX_SERVICE_TYPES = 3;

/** Secciones del formulario (navegación entre tabs; no implican progreso). */
type SectionId = "datos" | "tipo" | "observaciones" | "contacto";

/** Descripción corta de cada sección (texto de apoyo dentro del panel). */
const SECTION_DESCRIPTIONS: Record<SectionId, string> = {
  datos: "Sucursal, odómetro y datos del vehículo",
  tipo: "Tipos de atención (hasta 3)",
  observaciones: "Motivo del cliente y notas del taller",
  contacto: "Celular del propietario o «No disponible»",
};

/** Secciones abiertas/cerradas y estado visual: ver `FormSection`. */
const toStatus = (complete: boolean): SectionStatus =>
  complete ? "complete" : "incomplete";

const SECTION_FOR_FIELD: Partial<Record<keyof CheckInFormValues, SectionId>> = {
  branchId: "datos",
  mileageIn: "datos",
  mileageInUnreadableReason: "datos",
  brandSelection: "datos",
  brandName: "datos",
  modelSelection: "datos",
  modelName: "datos",
  vin: "datos",
  serviceTypeIds: "tipo",
  customServiceLabel: "tipo",
  customerComplaint: "observaciones",
  customerNotes: "observaciones",
  internalNotes: "observaciones",
  phoneAreaCode: "contacto",
  phoneNationalNumber: "contacto",
};

const DEFAULT_FORM_VALUES: CheckInFormValues = {
  branchId: "",
  mileageIn: "",
  mileageInUnreadable: false,
  mileageInUnreadableReason: "",
  customerComplaint: "",
  customerNotes: "",
  internalNotes: "",
  brandSelection: "",
  brandName: "",
  modelSelection: "",
  modelName: "",
  vin: "",
  phoneAreaCode: "",
  phoneNationalNumber: "",
  phoneUnavailable: false,
  serviceTypeIds: [],
  otherServiceSelected: false,
  customServiceLabel: "",
};

const checkInSchema = z
  .object({
    branchId: z.string().min(1, "Seleccioná una sucursal"),
    mileageIn: z.string(),
    mileageInUnreadable: z.boolean(),
    mileageInUnreadableReason: z.string(),
    customerComplaint: z
      .string()
      .max(500, "El motivo no puede superar los 500 caracteres"),
    customerNotes: z
      .string()
      .max(1000, "Las notas no pueden superar los 1000 caracteres"),
    internalNotes: z
      .string()
      .max(1000, "Las notas internas no pueden superar los 1000 caracteres"),
    brandSelection: z.string(),
    brandName: z
      .string()
      .max(100, "La marca no puede superar los 100 caracteres"),
    modelSelection: z.string(),
    modelName: z
      .string()
      .max(100, "El modelo no puede superar los 100 caracteres"),
    vin: z.string(),
    phoneAreaCode: z.string().max(6, "El código de área es demasiado largo"),
    phoneNationalNumber: z.string().max(12, "El número es demasiado largo"),
    phoneUnavailable: z.boolean(),
    serviceTypeIds: z.array(z.string()),
    otherServiceSelected: z.boolean(),
    customServiceLabel: z
      .string()
      .max(120, "El tipo de atención no puede superar los 120 caracteres"),
  })
  .superRefine((values, ctx) => {
    // ── Odómetro: valor numérico XOR excepción "no legible" + motivo ──
    if (values.mileageInUnreadable) {
      if (values.mileageInUnreadableReason.trim().length < 3) {
        ctx.addIssue({
          code: "custom",
          path: ["mileageInUnreadableReason"],
          message: CHECK_IN_MESSAGES.mileageReason,
        });
      }
    } else {
      const raw = values.mileageIn.trim();
      if (raw === "") {
        ctx.addIssue({
          code: "custom",
          path: ["mileageIn"],
          message: "Cargá el kilometraje o marcá que no se puede leer",
        });
      } else if (!/^\d+$/.test(raw)) {
        ctx.addIssue({
          code: "custom",
          path: ["mileageIn"],
          message: "El kilometraje debe ser un número entero",
        });
      }
    }

    // ── VIN opcional, formato espejo del backend (D-04 / D-145) ──
    const vin = normalizeVin(values.vin);
    if (vin !== "" && !isValidVin(vin)) {
      ctx.addIssue({
        code: "custom",
        path: ["vin"],
        message: CHECK_IN_MESSAGES.vinInvalid,
      });
    }

    // ── Catálogo XOR texto libre (por campo) ──
    if (
      values.brandSelection === OTHER_OPTION &&
      values.brandName.trim() === ""
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["brandName"],
        message: "Escribí la marca",
      });
    }
    if (
      values.modelSelection === OTHER_OPTION &&
      values.modelName.trim() === ""
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["modelName"],
        message: "Escribí el modelo",
      });
    }

    // ── Complaint (motivo/queja) obligatorio ──
    if (values.customerComplaint.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["customerComplaint"],
        message: "Describí el motivo o queja del cliente",
      });
    }

    // ── Celular (opcional solo si se marca "No disponible") ──
    if (!values.phoneUnavailable) {
      const area = values.phoneAreaCode.trim();
      const number = values.phoneNationalNumber.trim();
      if (area === "" || number === "") {
        ctx.addIssue({
          code: "custom",
          path: ["phoneNationalNumber"],
          message:
            "Ingresá el código de área y el número, o marcá «No disponible»",
        });
      } else {
        const areaDigits = area.replace(/\D/g, "");
        const numberDigits = number.replace(/\D/g, "");
        if (areaDigits.length < 2 || numberDigits.length < 2) {
          ctx.addIssue({
            code: "custom",
            path: ["phoneNationalNumber"],
            message: CHECK_IN_MESSAGES.ownerPhone,
          });
        }
      }
    }

    // ── Tipos de atención: al menos 1, máximo 3 (catálogo + "Otro") ──
    const total =
      values.serviceTypeIds.length + (values.otherServiceSelected ? 1 : 0);
    if (total < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["serviceTypeIds"],
        message: "Elegí al menos un tipo de atención",
      });
    }
    if (total > MAX_SERVICE_TYPES) {
      ctx.addIssue({
        code: "custom",
        path: ["serviceTypeIds"],
        message: CHECK_IN_MESSAGES.serviceTypesMax,
      });
    }
    if (
      values.otherServiceSelected &&
      values.customServiceLabel.trim().length < 3
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["customServiceLabel"],
        message: "Escribí el tipo de atención",
      });
    }
  });

type CheckInFormValues = z.infer<typeof checkInSchema>;

/** Mapea el campo del error del backend al path del formulario RHF. */
const ERROR_FIELD_TO_FORM_PATH: Partial<
  Record<CheckInErrorField, keyof CheckInFormValues>
> = {
  branchId: "branchId",
  mileageIn: "mileageIn",
  vin: "vin",
  brand: "brandSelection",
  model: "modelSelection",
  serviceTypes: "serviceTypeIds",
  ownerPhone: "phoneNationalNumber",
};

interface SuccessState {
  result: CheckInResult;
  /** La atención se registró con la excepción "odómetro no legible". */
  requiresBeforePhoto: boolean;
}

function vehicleSummary(vehicle: CareEpisodeLookupVehicle): string {
  // MVP sin versiones: marca + modelo (la `version` legacy no se muestra).
  const catalog = [vehicle.brand, vehicle.model].filter(Boolean).join(" ");
  const years = [vehicle.manufactureYear, vehicle.modelYear]
    .filter((year) => year != null)
    .join(" / ");
  return [catalog, years].filter(Boolean).join(" — ");
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-destructive" role="alert">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Sub-bloques del formulario
// ---------------------------------------------------------------------------

interface VehicleDataFieldsProps {
  plate: string;
  form: UseFormReturn<CheckInFormValues>;
  brands?: VehicleBrand[];
  models?: VehicleModel[];
  brandsLoading: boolean;
  modelsLoading: boolean;
  brandsError: boolean;
  modelsError: boolean;
}

/**
 * Rama CREAR: datos del vehículo que el taller registra en el momento.
 * La patente viene del lookup (no editable); marca/modelo son catálogo XOR texto
 * libre POR CAMPO (nunca id + texto a la vez). Sin año/versión/color.
 */
function VehicleDataFields({
  plate,
  form,
  brands,
  models,
  brandsLoading,
  modelsLoading,
  brandsError,
  modelsError,
}: VehicleDataFieldsProps) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const brandSelection = watch("brandSelection");
  const modelSelection = watch("modelSelection");
  const brandIsCatalog =
    brandSelection !== "" && brandSelection !== OTHER_OPTION;

  const handleBrandChange = (value: string) => {
    setValue("brandSelection", value, { shouldValidate: true });
    setValue("modelSelection", "");
    setValue("modelName", "");
  };

  return (
    <fieldset className="grid gap-3 rounded-control border border-border/60 bg-card p-4">
      <legend className="mb-1 px-1 text-sm font-semibold text-foreground">
        <span className="flex items-center gap-1.5">
          <CarFront
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          Datos del vehículo
        </span>
      </legend>

      <div className="grid gap-2">
        <Label htmlFor="check-in-plate">Patente</Label>
        <Input
          id="check-in-plate"
          value={plate}
          readOnly
          aria-readonly="true"
          data-testid="check-in-plate"
        />
        <p className="text-xs text-muted-foreground">
          La patente viene de la búsqueda y no se puede editar acá.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="check-in-brand">Marca (opcional)</Label>
        <Select
          id="check-in-brand"
          value={brandSelection}
          onChange={(event) => handleBrandChange(event.target.value)}
          disabled={brandsLoading}
        >
          <option value="">
            {brandsLoading ? "Cargando..." : "Seleccionar"}
          </option>
          {brands?.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
          <option value={OTHER_OPTION}>Otra marca</option>
        </Select>
        {brandsError && (
          <p className="text-xs text-muted-foreground" role="alert">
            No pudimos cargar el catálogo. Podés elegir &quot;Otra marca&quot; y
            escribirla.
          </p>
        )}
        {brandSelection === OTHER_OPTION && (
          <div className="grid gap-2">
            <Label htmlFor="check-in-brand-name">Escribí la marca</Label>
            <Input
              id="check-in-brand-name"
              placeholder="Ej. Toyota"
              autoComplete="off"
              maxLength={100}
              aria-invalid={!!errors.brandName}
              {...register("brandName")}
            />
            {errors.brandName && (
              <FieldError>{errors.brandName.message}</FieldError>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="check-in-model">Modelo (opcional)</Label>
        {brandSelection === OTHER_OPTION ? (
          <>
            <Input
              id="check-in-model"
              placeholder="Ej. Corolla"
              autoComplete="off"
              maxLength={100}
              aria-invalid={!!errors.modelName}
              {...register("modelName")}
            />
            {errors.modelName && (
              <FieldError>{errors.modelName.message}</FieldError>
            )}
          </>
        ) : (
          <>
            <Select
              id="check-in-model"
              value={modelSelection}
              onChange={(event) =>
                setValue("modelSelection", event.target.value, {
                  shouldValidate: true,
                })
              }
              disabled={!brandIsCatalog || modelsLoading}
            >
              <option value="">
                {modelsLoading ? "Cargando..." : "Seleccionar"}
              </option>
              {models?.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
              <option value={OTHER_OPTION}>Otro modelo</option>
            </Select>
            {modelsError && (
              <p className="text-xs text-muted-foreground" role="alert">
                No pudimos cargar los modelos. Podés elegir &quot;Otro
                modelo&quot; y escribirlo.
              </p>
            )}
            {modelSelection === OTHER_OPTION && (
              <div className="grid gap-2">
                <Label htmlFor="check-in-model-name">Escribí el modelo</Label>
                <Input
                  id="check-in-model-name"
                  placeholder="Ej. Corolla"
                  autoComplete="off"
                  maxLength={100}
                  aria-invalid={!!errors.modelName}
                  {...register("modelName")}
                />
                {errors.modelName && (
                  <FieldError>{errors.modelName.message}</FieldError>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="check-in-vin">VIN (opcional)</Label>
        <Input
          id="check-in-vin"
          placeholder="Número de chasis"
          autoComplete="off"
          maxLength={17}
          aria-invalid={!!errors.vin}
          {...register("vin")}
        />
        {errors.vin ? (
          <FieldError>{errors.vin.message}</FieldError>
        ) : (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            El VIN tiene 17 caracteres, sin las letras I, O ni Q. Mejora la
            trazabilidad de la historia del vehículo.
          </p>
        )}
      </div>
    </fieldset>
  );
}

interface ServiceTypesSectionProps {
  workshopId: string;
  serviceTypes?: ServiceType[];
  isLoading: boolean;
  isError: boolean;
  onboardingRequired: boolean;
  onRetry: () => void;
  selectedIds: string[];
  otherSelected: boolean;
  customServiceLabel: string;
  onToggle: (id: string) => void;
  onToggleOther: () => void;
  onCustomLabelChange: (value: string) => void;
  selectionError: string | null;
  serviceTypesError?: string;
  customLabelError?: string;
  disabled: boolean;
}

/**
 * Clases de una píldora de tipo de atención.
 *
 * El panel abierto es celeste: las píldoras son blancas para contrastar.
 * Estado activo: borde `primary` + anillo sutil + el tilde dentro de un
 * círculo `primary` relleno. Estado inactivo: borde neutro. El texto
 * acompaña al color (nunca solo color).
 */
function serviceTypePillClass(active: boolean) {
  return cn(
    "inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border px-4 py-2",
    "text-sm font-medium transition-colors duration-normal",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:cursor-not-allowed disabled:opacity-60",
    active
      ? "border-primary/50 bg-card text-foreground shadow-sm ring-1 ring-primary/30"
      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
  );
}

/** "N de 3 seleccionados": píldora con el número en bold y color primario. */
function SelectedCountPill({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span className="font-semibold tabular-nums text-primary">{count}</span>
      <span>de {MAX_SERVICE_TYPES} seleccionados</span>
    </span>
  );
}

/** Tipos de atención: píldoras del catálogo + "Otro" (obligatorio al menos 1, máx 3). */
function ServiceTypesSection({
  workshopId,
  serviceTypes,
  isLoading,
  isError,
  onboardingRequired,
  onRetry,
  selectedIds,
  otherSelected,
  customServiceLabel,
  onToggle,
  onToggleOther,
  onCustomLabelChange,
  selectionError,
  serviceTypesError,
  customLabelError,
  disabled,
}: ServiceTypesSectionProps) {
  const selectedCount = selectedIds.length + (otherSelected ? 1 : 0);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Elegí al menos un tipo (hasta {MAX_SERVICE_TYPES}).
        </p>
        <SelectedCountPill count={selectedCount} />
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-semibold text-foreground">
          Tipos de atención
        </p>

        {isLoading && (
          <p className="text-sm text-muted-foreground" role="status">
            Cargando tipos de atención...
          </p>
        )}

        {isError && (
          <div className="grid gap-2" role="alert">
            <p className="text-sm text-muted-foreground">
              No pudimos cargar los tipos de atención. Podés registrar la
              atención sin tipos.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="justify-self-start"
            >
              Reintentar
            </Button>
          </div>
        )}

        {onboardingRequired && (
          <Callout variant="warning" icon={Info}>
            Tu taller todavía no cargó especialidades, por eso ves todos los
            tipos. Cargalas en{" "}
            <Link
              href={`/workshops/${workshopId}`}
              className="font-medium underline underline-offset-2"
            >
              Mi taller
            </Link>{" "}
            para filtrar.
          </Callout>
        )}

        {!isLoading && !isError && (
          <div
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            role="group"
            aria-label="Tipos de atención"
          >
            {serviceTypes?.map((serviceType) => {
              const active = selectedIds.includes(serviceType.id);
              return (
                <button
                  key={serviceType.id}
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => onToggle(serviceType.id)}
                  className={serviceTypePillClass(active)}
                >
                  {active && (
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      aria-hidden="true"
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                  <span className="min-w-0 break-words">
                    {serviceType.name}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={otherSelected}
              disabled={disabled}
              onClick={onToggleOther}
              className={serviceTypePillClass(otherSelected)}
            >
              {otherSelected && (
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  aria-hidden="true"
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
              <span className="min-w-0 break-words">Otro</span>
            </button>
          </div>
        )}
      </div>

      {otherSelected && (
        <div className="grid gap-2">
          <Label htmlFor="check-in-custom-service">Otro tipo de atención</Label>
          <Input
            id="check-in-custom-service"
            className="bg-card"
            placeholder="Escribí el tipo de atención"
            autoComplete="off"
            maxLength={120}
            value={customServiceLabel}
            onChange={(event) => onCustomLabelChange(event.target.value)}
            aria-invalid={!!customLabelError}
          />
          {customLabelError && <FieldError>{customLabelError}</FieldError>}
        </div>
      )}

      {(selectionError || serviceTypesError) && (
        <FieldError>{selectionError ?? serviceTypesError}</FieldError>
      )}
    </div>
  );
}

interface OwnerPhoneFieldsProps {
  form: UseFormReturn<CheckInFormValues>;
  unavailable: boolean;
}

/** Celular obligatorio (o marcado "No disponible"): par área/número. */
function OwnerPhoneFields({ form, unavailable }: OwnerPhoneFieldsProps) {
  const {
    register,
    formState: { errors },
  } = form;
  const pairError =
    errors.phoneAreaCode?.message ?? errors.phoneNationalNumber?.message;

  return (
    <fieldset className="grid gap-3 rounded-control border border-border/60 bg-card p-4">
      <legend className="text-sm font-semibold text-foreground">
        <span className="flex items-center gap-1.5 mb-5">
          <Smartphone
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          Celular del propietario
        </span>
      </legend>

      <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
        <div className="grid gap-2">
          <Label htmlFor="check-in-phone-area">Código de área</Label>
          <Input
            id="check-in-phone-area"
            inputMode="numeric"
            sanitize="digits"
            placeholder="Ej. 11"
            autoComplete="off"
            maxLength={6}
            disabled={unavailable}
            aria-invalid={!!pairError}
            {...register("phoneAreaCode")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="check-in-phone-number">Número</Label>
          <Input
            id="check-in-phone-number"
            inputMode="numeric"
            sanitize="digits"
            placeholder="Ej. 55551234"
            autoComplete="off"
            maxLength={12}
            disabled={unavailable}
            aria-invalid={!!pairError}
            {...register("phoneNationalNumber")}
          />
        </div>
      </div>

      <div className="flex items-start gap-2">
        <input
          id="check-in-phone-unavailable"
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-border"
          {...register("phoneUnavailable")}
        />
        <Label htmlFor="check-in-phone-unavailable" className="font-normal">
          No disponible
        </Label>
      </div>

      {pairError ? (
        <FieldError>{pairError}</FieldError>
      ) : (
        <p className="text-xs text-muted-foreground">
          Ingresá el código de área y el número, o marcá «No disponible» si no
          hay canal de contacto (el vehículo queda sin vía de reclamos).
        </p>
      )}
    </fieldset>
  );
}

interface SuccessSectionProps {
  success: SuccessState;
  beforePhotoCount: number;
  skipBeforePhoto: boolean;
  uploadFailed: boolean;
  onUploaded: (attachment: CareEpisodeAttachment) => void;
  onUploadError: () => void;
  onSkipBeforePhoto: () => void;
  onFinalize: () => void;
  onReset: () => void;
}

/** Pantalla de éxito (two-step: el episodio ya existe, la evidencia va acá). */
function SuccessSection({
  success,
  beforePhotoCount,
  skipBeforePhoto,
  uploadFailed,
  onUploaded,
  onUploadError,
  onSkipBeforePhoto,
  onFinalize,
  onReset,
}: SuccessSectionProps) {
  const { result, requiresBeforePhoto } = success;
  const beforePhotoMissing = requiresBeforePhoto && beforePhotoCount === 0;
  const finalizeBlocked = beforePhotoMissing && !skipBeforePhoto;

  return (
    <Card>
      <CardContent className="grid gap-4">
        <Callout variant="success" icon={CheckCircle2}>
          Atención ingresada — {result.licensePlate}
        </Callout>

        <p className="text-sm text-muted-foreground">
          {result.vehicleCreated
            ? "Registramos el vehículo en la plataforma."
            : "Atención sobre el vehículo ya registrado."}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {result.ownerContact.status === "unavailable" ? (
            <Badge variant="warning">Sin canal de reclamo</Badge>
          ) : result.ownerContact.phoneMasked ? (
            <Badge variant="secondary">
              Contacto: {result.ownerContact.phoneMasked}
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/vehicles/${result.vehicleId}/servicios/${result.careEpisodeId}`}
          >
            <Button variant="outline">
              <Eye className="h-4 w-4" aria-hidden="true" />
              Ver atención
            </Button>
          </Link>
          <a href="#evidencia-ingreso">
            <Button variant="outline">
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              Cargar fotos de ingreso
            </Button>
          </a>
        </div>

        <div
          id="evidencia-ingreso"
          className="grid gap-2 rounded-control p-4 ring-1 ring-foreground/10"
        >
          <div>
            <p className="text-sm font-medium">Evidencia de ingreso</p>
            {!requiresBeforePhoto && (
              <p className="text-xs text-muted-foreground">
                Recomendamos subir al menos 1 foto del tablero en la fase
                &quot;Antes&quot;. No es obligatoria.
              </p>
            )}
          </div>

          {beforePhotoMissing && (
            <Callout variant="warning" icon={Info} role="alert">
              Falta la foto del tablero: es obligatoria cuando el odómetro no se
              puede leer.
            </Callout>
          )}

          {skipBeforePhoto && (
            <Callout variant="warning" icon={Info} role="status">
              La foto del tablero quedó pendiente. Podés cargarla después desde
              la atención.
            </Callout>
          )}

          <AttachmentsUploader
            episodeId={result.careEpisodeId}
            defaultPhase="before"
            onUploaded={onUploaded}
            onUploadError={onUploadError}
          />

          {beforePhotoMissing && uploadFailed && !skipBeforePhoto && (
            <Button type="button" variant="outline" onClick={onSkipBeforePhoto}>
              Cargarla después desde la atención
            </Button>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button onClick={onFinalize} disabled={finalizeBlocked}>
          Finalizar
        </Button>
        <Button variant="outline" onClick={onReset}>
          Registrar otra atención
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function NewCareEpisodePage() {
  const activeContext = useActiveContext();
  const workshopId =
    activeContext?.type === "WORKSHOP" ? activeContext.workshopId : null;
  const { status, user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const hasWorkshopMembership = (user?.workshopMemberships?.length ?? 0) > 0;

  // Guard de membresía (PO): sin taller no hay journey de atenciones →
  // redirect a /dashboard. UX únicamente — el backend ya enforcea (403
  // WorkshopOnly). Durante `loading` NO se redirige (evita un falso
  // redirect en el bootstrap de la sesión).
  useEffect(() => {
    if (status !== "loading" && !hasWorkshopMembership) {
      router.replace("/dashboard");
    }
  }, [status, hasWorkshopMembership, router]);

  // ── Búsqueda por patente ────────────────────────────────────────────────────
  const [plateInput, setPlateInput] = useState("");
  // Error de formato (AAA111 / AA111AA) — se valida ANTES del lookup para no
  // consultar/persistir una patente que el backend rechazaría igual.
  const [plateFormatError, setPlateFormatError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [confirmedVehicle, setConfirmedVehicle] = useState(false);
  const lastPlateRef = useRef("");
  const plateInputRef = useRef<HTMLInputElement>(null);

  // ── Formulario de check-in ────────────────────────────────────────────────
  const form = useForm<CheckInFormValues>({
    resolver: zodResolver(checkInSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    getValues,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  const branchId = watch("branchId");
  const mileageIn = watch("mileageIn");
  const mileageInUnreadable = watch("mileageInUnreadable");
  const mileageInUnreadableReason = watch("mileageInUnreadableReason");
  const brandSelection = watch("brandSelection");
  const selectedServiceTypeIds = watch("serviceTypeIds");
  const otherServiceSelected = watch("otherServiceSelected");
  const customServiceLabel = watch("customServiceLabel");
  const phoneUnavailable = watch("phoneUnavailable");
  const phoneAreaCode = watch("phoneAreaCode");
  const phoneNationalNumber = watch("phoneNationalNumber");
  const customerComplaint = watch("customerComplaint");

  // ── Navegación entre secciones (solo una abierta a la vez) ──
  const [openSection, setOpenSection] = useState<string[]>([]);
  const mileageOk = mileageInUnreadable
    ? mileageInUnreadableReason.trim().length >= 3
    : (() => {
        const raw = mileageIn.trim();
        return raw !== "" && /^\d+$/.test(raw);
      })();
  const selectedTotal =
    selectedServiceTypeIds.length + (otherServiceSelected ? 1 : 0);
  const sectionStatus: Record<SectionId, boolean> = {
    datos: branchId.trim() !== "" && mileageOk,
    tipo:
      selectedTotal >= 1 &&
      selectedTotal <= MAX_SERVICE_TYPES &&
      (!otherServiceSelected || customServiceLabel.trim().length >= 3),
    observaciones: customerComplaint.trim().length > 0,
    contacto:
      phoneUnavailable ||
      (phoneAreaCode.trim() !== "" &&
        phoneNationalNumber.trim() !== "" &&
        phoneAreaCode.replace(/\D/g, "").length >= 2 &&
        phoneNationalNumber.replace(/\D/g, "").length >= 2),
  };

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serviceTypesSelectionError, setServiceTypesSelectionError] = useState<
    string | null
  >(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [beforePhotoCount, setBeforePhotoCount] = useState(0);
  const [skipBeforePhoto, setSkipBeforePhoto] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);

  const isCreateBranch = lookup.status === "not-found";

  // ── Sucursales del taller (GET /workshops/:id — branches activas) ─────────
  const workshopQuery = useQuery({
    queryKey: ["workshop", workshopId],
    queryFn: () => workshopApi.getWorkshop(workshopId!),
    enabled: workshopId !== null,
  });
  const branches = useMemo(
    () => workshopQuery.data?.branches ?? [],
    [workshopQuery.data?.branches],
  );
  const branchesLoading = workshopId !== null && workshopQuery.isLoading;

  // ── Tipos de atención (GET /care-episodes/service-types) ──────────────────
  const serviceTypesQuery = useQuery({
    queryKey: ["care-episode-service-types", workshopId],
    queryFn: () => careEpisodeApi.listServiceTypes(),
    enabled: workshopId !== null,
  });

  // ── Catálogo vehicular (solo rama CREAR) ──────────────────────────────────
  const catalogBrandId =
    brandSelection !== "" && brandSelection !== OTHER_OPTION
      ? brandSelection
      : "";

  const brandsQuery = useQuery({
    queryKey: ["vehicle-brands"],
    queryFn: vehicleApi.listBrands,
    enabled: isCreateBranch,
  });

  const modelsQuery = useQuery({
    queryKey: ["vehicle-models", catalogBrandId],
    queryFn: () => vehicleApi.listModels(catalogBrandId),
    enabled: isCreateBranch && catalogBrandId !== "",
  });

  const resetFormForLookup = () => {
    // Conserva la sucursal elegida (si existía) y limpia el resto: los datos
    // de una patente no deben viajar a otra.
    reset({ ...DEFAULT_FORM_VALUES, branchId: getValues("branchId") });
    setServiceTypesSelectionError(null);
    setSubmitError(null);
  };

  const runLookup = async (plate: string) => {
    const normalized = plate.trim().toUpperCase(); // D-037/D-042
    if (normalized.length === 0) {
      return;
    }
    lastPlateRef.current = normalized;
    setLookup({ status: "searching" });
    setConfirmedVehicle(false);
    setSubmitError(null);
    try {
      const vehicle = await careEpisodeApi.lookupVehicleByPlate(normalized);
      setLookup({ status: "found", plate: normalized, vehicle });
      resetFormForLookup();
    } catch (error) {
      const apiError = error as { status?: number };
      if (apiError.status === 404) {
        setLookup({ status: "not-found", plate: normalized });
        resetFormForLookup();
        return;
      }
      const info = resolveLookupErrorMessage(error);
      setLookup({
        status: "error",
        message: info.message,
        detail: info.detail,
      });
    }
  };

  const handleLookupSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Control de formato: solo AAA111 (3.er carácter letra) o AA111AA (3.er
    // carácter número). Sin formato válido no se consulta el backend.
    if (!isValidLicensePlate(plateInput)) {
      setPlateFormatError(LICENSE_PLATE_FORMAT_ERROR);
      setLookup({ status: "idle" });
      setConfirmedVehicle(false);
      return;
    }
    setPlateFormatError(null);
    void runLookup(plateInput);
  };

  // Editar la patente invalida el resultado: hay que volver a buscar antes de
  // poder enviar (nunca se reutiliza el vehículo de una patente anterior).
  const handlePlateChange = (value: string) => {
    setPlateInput(value);
    setPlateFormatError(null);
    if (lookup.status !== "idle" && lookup.status !== "searching") {
      setLookup({ status: "idle" });
      setConfirmedVehicle(false);
      setSubmitError(null);
    }
  };

  // Al cambiar de taller, la branch seleccionada deja de ser válida.
  useEffect(() => {
    setValue("branchId", "");
  }, [workshopId, setValue]);

  // Spec §5: "branch (pre-seleccionada)" — el backend devuelve la sede primero.
  useEffect(() => {
    if (branchId === "" && branches.length > 0) {
      setValue("branchId", branches[0].id);
    }
  }, [branchId, branches, setValue]);

  // ── Tipos de atención: selección con tope de 3 ────────────────────────────
  const toggleServiceType = (id: string) => {
    const current = getValues("serviceTypeIds");
    if (current.includes(id)) {
      setServiceTypesSelectionError(null);
      setValue(
        "serviceTypeIds",
        current.filter((value) => value !== id),
        { shouldValidate: true },
      );
      return;
    }
    const total = current.length + (getValues("otherServiceSelected") ? 1 : 0);
    if (total >= MAX_SERVICE_TYPES) {
      setServiceTypesSelectionError(CHECK_IN_MESSAGES.serviceTypesMax);
      return;
    }
    setServiceTypesSelectionError(null);
    setValue("serviceTypeIds", [...current, id], { shouldValidate: true });
  };

  const toggleOtherService = () => {
    const selected = getValues("otherServiceSelected");
    if (!selected) {
      const total = getValues("serviceTypeIds").length + 1;
      if (total > MAX_SERVICE_TYPES) {
        setServiceTypesSelectionError(CHECK_IN_MESSAGES.serviceTypesMax);
        return;
      }
      setServiceTypesSelectionError(null);
      setValue("otherServiceSelected", true, { shouldValidate: true });
      return;
    }
    setServiceTypesSelectionError(null);
    setValue("otherServiceSelected", false, { shouldValidate: true });
    setValue("customServiceLabel", "");
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const buildVehiclePayload = (
    values: CheckInFormValues,
  ): Partial<CheckInInput> => {
    const payload: Partial<CheckInInput> = {};

    if (values.brandSelection === OTHER_OPTION) {
      const brandName = values.brandName.trim();
      if (brandName !== "") payload.brandName = brandName;
    } else if (values.brandSelection !== "") {
      payload.brandId = values.brandSelection;
    }

    if (values.modelSelection === OTHER_OPTION) {
      const modelName = values.modelName.trim();
      if (modelName !== "") payload.modelName = modelName;
    } else if (values.modelSelection !== "") {
      payload.modelId = values.modelSelection;
    }

    const vin = normalizeVin(values.vin);
    if (vin !== "") payload.vin = vin;

    return payload;
  };

  const buildOwnerPhone = (
    values: CheckInFormValues,
  ): CheckInInput["ownerPhone"] => {
    if (values.phoneUnavailable) return undefined;
    const areaCode = values.phoneAreaCode.trim();
    const nationalNumber = values.phoneNationalNumber.trim();
    if (areaCode === "" && nationalNumber === "") return undefined;
    return { areaCode, nationalNumber };
  };

  const onSubmit = async (values: CheckInFormValues) => {
    if (lookup.status !== "found" && lookup.status !== "not-found") {
      return;
    }
    if (lookup.status === "found" && !confirmedVehicle) {
      return;
    }

    setSubmitError(null);
    clearErrors();

    const unreadable = values.mileageInUnreadable;
    const payload: CheckInInput = {
      licensePlate: lookup.plate,
      branchId: values.branchId,
      ...(lookup.status === "not-found" ? buildVehiclePayload(values) : {}),
      ...(unreadable
        ? {
            mileageInUnreadable: true,
            mileageInUnreadableReason: values.mileageInUnreadableReason.trim(),
          }
        : { mileageIn: Number(values.mileageIn.trim()) }),
      ...(values.customerComplaint.trim() !== ""
        ? { customerComplaint: values.customerComplaint.trim() }
        : {}),
      ...(values.customerNotes.trim() !== ""
        ? { customerNotes: values.customerNotes.trim() }
        : {}),
      ...(values.internalNotes.trim() !== ""
        ? { internalNotes: values.internalNotes.trim() }
        : {}),
      ...(values.serviceTypeIds.length > 0
        ? { serviceTypeIds: values.serviceTypeIds }
        : {}),
      ...(values.otherServiceSelected && values.customServiceLabel.trim() !== ""
        ? { customServiceLabel: values.customServiceLabel.trim() }
        : {}),
      ...(buildOwnerPhone(values)
        ? { ownerPhone: buildOwnerPhone(values) }
        : {}),
    };

    try {
      const response = await careEpisodeApi.checkIn(payload);
      const result = response.data;

      setSuccess({ result, requiresBeforePhoto: unreadable });
      setBeforePhotoCount(0);
      setSkipBeforePhoto(false);
      setUploadFailed(false);

      // Listado de atenciones del taller (`atenciones/page.tsx:125`): prefijo
      // sin página para cubrir cualquier paginación ya cacheada.
      if (workshopId) {
        void queryClient.invalidateQueries({
          queryKey: ["care-episode-list", workshopId],
        });
      }
      // Historia del vehículo (`vehicles/[id]/page.tsx:489`).
      void queryClient.invalidateQueries({
        queryKey: ["vehicle", result.vehicleId, "history"],
      });
      // Detalle del episodio (puede haberse cacheado desde otra superficie).
      void queryClient.invalidateQueries({
        queryKey: ["care-episode", result.careEpisodeId],
      });
    } catch (error) {
      const info = resolveCheckInError(error);
      const path = info.field
        ? ERROR_FIELD_TO_FORM_PATH[info.field]
        : undefined;
      if (path) {
        setError(path, { type: "server", message: info.message });
      } else {
        setSubmitError(info.message);
      }
      // 409 de VIN / vehículo dado de baja: conservar el formulario y devolver
      // el foco a la patente para revisar el vehículo.
      if (info.focusPlate) {
        plateInputRef.current?.focus();
        plateInputRef.current?.scrollIntoView({ block: "center" });
      }
    }
  };

  const resetAfterSuccess = () => {
    setSuccess(null);
    setLookup({ status: "idle" });
    setConfirmedVehicle(false);
    setPlateInput("");
    setPlateFormatError(null);
    setSubmitError(null);
    setBeforePhotoCount(0);
    setSkipBeforePhoto(false);
    setUploadFailed(false);
    setServiceTypesSelectionError(null);
    reset(DEFAULT_FORM_VALUES);
  };

  const handleAttachmentUploaded = (attachment: CareEpisodeAttachment) => {
    setUploadFailed(false);
    if (attachment.phase === "before") {
      setBeforePhotoCount((count) => count + 1);
    }
    if (success) {
      void queryClient.invalidateQueries({
        queryKey: ["care-episode", success.result.careEpisodeId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["vehicle", success.result.vehicleId, "history"],
      });
    }
  };

  // Submit inválido: mover la vista a la primera sección con error (sin
  // perder los valores ya cargados: RHF conserva el estado del formulario).
  const onInvalid = (errors: FieldErrors<CheckInFormValues>) => {
    const firstField = Object.keys(errors)[0] as
      | keyof CheckInFormValues
      | undefined;
    const target = firstField ? SECTION_FOR_FIELD[firstField] : undefined;
    if (target) setOpenSection([target]);
  };

  // ── Estados de la página ──────────────────────────────────────────────────

  // Sin taller seleccionado: WORKSHOP-only por diseño (D-024 A2 / D-035).
  if (workshopId === null) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <Heading />
        <Card>
          <CardContent>
            <p role="status" className="text-sm text-muted-foreground">
              Para registrar una atención necesitás operar en el contexto de un
              taller.{" "}
              {hasWorkshopMembership
                ? "Entrá a la sección Talleres del menú y elegí tu taller para activar su contexto."
                : "Todavía no formás parte de un taller. Pedí una invitación por email para sumarte al equipo de uno."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showForm =
    lookup.status === "not-found" ||
    (lookup.status === "found" && confirmedVehicle);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Heading />

      {success ? (
        <SuccessSection
          success={success}
          beforePhotoCount={beforePhotoCount}
          skipBeforePhoto={skipBeforePhoto}
          uploadFailed={uploadFailed}
          onUploaded={handleAttachmentUploaded}
          onUploadError={() => setUploadFailed(true)}
          onSkipBeforePhoto={() => setSkipBeforePhoto(true)}
          onFinalize={() => router.push("/atenciones")}
          onReset={resetAfterSuccess}
        />
      ) : (
        <>
          {/* Búsqueda por patente */}
          <Card>
            <CardContent className="grid gap-4">
              <h2 className="text-base font-semibold">Buscar vehículo</h2>
              <form onSubmit={handleLookupSubmit} className="grid gap-2">
                <Label htmlFor="plate">Patente del vehículo</Label>
                <div className="flex gap-2">
                  <Input
                    id="plate"
                    ref={plateInputRef}
                    placeholder="Ej. ABC123"
                    sanitize="plate"
                    maxLength={7}
                    autoComplete="off"
                    aria-invalid={plateFormatError ? true : undefined}
                    value={plateInput}
                    onChange={(event) => handlePlateChange(event.target.value)}
                  />
                  <Button
                    type="submit"
                    disabled={
                      lookup.status === "searching" || plateInput.trim() === ""
                    }
                  >
                    {lookup.status === "searching" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Buscar
                  </Button>
                </div>
                {plateFormatError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {plateFormatError}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Formato: AAA111 (vieja) o AA111AA (nueva).
                  </p>
                )}
              </form>

              {lookup.status === "searching" && (
                <p className="text-sm text-muted-foreground" role="status">
                  Buscando vehículo...
                </p>
              )}

              {lookup.status === "found" && !confirmedVehicle && (
                <div
                  className="grid gap-3 rounded-control border border-border bg-muted/30 p-4"
                  data-testid="vehicle-found"
                >
                  <div className="grid gap-1">
                    <p className="text-sm font-semibold">
                      Encontramos el vehículo
                    </p>
                    <p className="text-sm font-semibold">
                      {lookup.vehicle.licensePlate}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {vehicleSummary(lookup.vehicle) ||
                        "Sin datos de catálogo"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setConfirmedVehicle(true)}
                  >
                    Continuar con el check-in
                  </Button>
                </div>
              )}

              {lookup.status === "not-found" && (
                <Callout variant="info" icon={Info}>
                  No encontramos la patente {lookup.plate}. Lo registramos como
                  vehículo nuevo.
                </Callout>
              )}

              {lookup.status === "error" && (
                <div className="grid gap-2" role="alert">
                  <p className="text-sm text-destructive">{lookup.message}</p>
                  {lookup.detail && (
                    <p className="text-xs text-muted-foreground">
                      {lookup.detail}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runLookup(lastPlateRef.current)}
                  >
                    Reintentar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Check-in: rama reutilizar (confirmada) o rama crear (404) */}
          {showForm && (
            <form
              onSubmit={handleSubmit(onSubmit, onInvalid)}
              noValidate
              className="grid gap-4 pb-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">
                      Registrar check-in
                    </h2>
                    <Badge variant="secondary" className="text-xs">
                      Nuevo ingreso
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {lookup.status === "found"
                      ? `${lookup.plate} — ${vehicleSummary(lookup.vehicle) || "Sin datos de catálogo"}`
                      : `${lookup.plate} — vehículo nuevo`}
                  </p>
                </div>
              </div>

              <FormSectionAccordion
                value={openSection}
                onValueChange={setOpenSection}
              >
                {/* Grupo 1 — Datos de ingreso (vehículo + odómetro) */}
                <FormSection
                  value="datos"
                  title="Datos de ingreso"
                  status={toStatus(sectionStatus.datos)}
                  description={SECTION_DESCRIPTIONS.datos}
                >
                    <div className="grid gap-2">
                      <Label htmlFor="branchId">Sucursal</Label>
                      <Select
                        id="branchId"
                        className="bg-card"
                        value={branchId ?? ""}
                        onChange={(event) =>
                          setValue("branchId", event.target.value, {
                            shouldValidate: true,
                          })
                        }
                        disabled={branchesLoading || branches.length === 0}
                        aria-invalid={
                          !!errors.branchId ||
                          (branches.length === 0 && !branchesLoading)
                        }
                      >
                        <option value="">
                          {branchesLoading
                            ? "Cargando sucursales..."
                            : "Seleccionar sucursal"}
                        </option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                            {branch.isHeadquarters ? " (Sede)" : ""}
                          </option>
                        ))}
                      </Select>
                      {errors.branchId && (
                        <FieldError>{errors.branchId.message}</FieldError>
                      )}
                      {!branchesLoading && branches.length === 0 && (
                        <p
                          className="text-sm text-muted-foreground"
                          role="alert"
                        >
                          El taller no tiene sucursales activas configuradas. No
                          se puede registrar una atención hasta que exista al
                          menos una sucursal.
                        </p>
                      )}
                      {workshopQuery.isError && (
                        <p className="text-sm text-destructive" role="alert">
                          No se pudieron cargar las sucursales del taller.
                        </p>
                      )}
                    </div>

                    {isCreateBranch && (
                      <VehicleDataFields
                        plate={lookup.plate}
                        form={form}
                        brands={brandsQuery.data}
                        models={modelsQuery.data}
                        brandsLoading={brandsQuery.isLoading}
                        modelsLoading={modelsQuery.isLoading}
                        brandsError={brandsQuery.isError}
                        modelsError={modelsQuery.isError}
                      />
                    )}

                    {/* Odómetro obligatorio: valor XOR excepción "no legible" */}
                    <fieldset className="grid gap-3 rounded-control border border-border/60 bg-card p-3">
                      <legend className="text-sm font-semibold text-foreground">
                        <span className="flex items-center gap-1.5 mb-5">
                          <Gauge
                            className="size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                          Odómetro de ingreso
                        </span>
                      </legend>
                      <div className="grid gap-2">
                        <Label htmlFor="mileageIn">Kilometraje</Label>
                        <Input
                          id="mileageIn"
                          inputMode="numeric"
                          sanitize="digits"
                          placeholder="Ej. 45000"
                          maxLength={10}
                          autoComplete="off"
                          disabled={mileageInUnreadable}
                          aria-invalid={!!errors.mileageIn}
                          {...register("mileageIn")}
                        />
                        {errors.mileageIn && (
                          <FieldError>{errors.mileageIn.message}</FieldError>
                        )}
                      </div>

                      <div className="flex items-start gap-2">
                        <input
                          id="check-in-mileage-unreadable"
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-border"
                          {...register("mileageInUnreadable")}
                        />
                        <Label
                          htmlFor="check-in-mileage-unreadable"
                          className="font-normal"
                        >
                          No se puede leer el odómetro
                        </Label>
                      </div>

                      {mileageInUnreadable && (
                        <div className="grid gap-2">
                          <Label htmlFor="mileageInUnreadableReason">
                            Motivo (mínimo 3 caracteres)
                          </Label>
                          <Textarea
                            id="mileageInUnreadableReason"
                            placeholder="Ej. El tablero está roto"
                            rows={2}
                            maxLength={200}
                            aria-invalid={!!errors.mileageInUnreadableReason}
                            {...register("mileageInUnreadableReason")}
                          />
                          {errors.mileageInUnreadableReason && (
                            <FieldError>
                              {errors.mileageInUnreadableReason.message}
                            </FieldError>
                          )}
                        </div>
                      )}
                    </fieldset>
                </FormSection>

                {/* Grupo 2 — Tipo de servicio */}
                <FormSection
                  value="tipo"
                  title="Tipo de servicio"
                  status={toStatus(sectionStatus.tipo)}
                >
                    <ServiceTypesSection
                      workshopId={workshopId}
                      serviceTypes={serviceTypesQuery.data?.data}
                      isLoading={serviceTypesQuery.isLoading}
                      isError={serviceTypesQuery.isError}
                      onboardingRequired={
                        serviceTypesQuery.data?.onboardingRequired ?? false
                      }
                      onRetry={() => void serviceTypesQuery.refetch()}
                      selectedIds={selectedServiceTypeIds}
                      otherSelected={otherServiceSelected}
                      customServiceLabel={customServiceLabel}
                      onToggle={toggleServiceType}
                      onToggleOther={toggleOtherService}
                      onCustomLabelChange={(value) =>
                        setValue("customServiceLabel", value, {
                          shouldValidate: true,
                        })
                      }
                      selectionError={serviceTypesSelectionError}
                      serviceTypesError={errors.serviceTypeIds?.message}
                      customLabelError={errors.customServiceLabel?.message}
                      disabled={isSubmitting}
                    />
                </FormSection>

                {/* Grupo 3 — Observaciones (cliente + taller) */}
                <FormSection
                  value="observaciones"
                  title="Observaciones"
                  status={toStatus(sectionStatus.observaciones)}
                  description={SECTION_DESCRIPTIONS.observaciones}
                >
                    <div className="grid gap-2">
                      <Label htmlFor="customerComplaint">
                        Motivo / queja del cliente
                      </Label>
                      <Textarea
                        id="customerComplaint"
                        className="bg-card"
                        placeholder="Ej. Ruido en el motor al acelerar..."
                        rows={3}
                        maxLength={500}
                        aria-invalid={!!errors.customerComplaint}
                        {...register("customerComplaint")}
                      />
                      {errors.customerComplaint ? (
                        <FieldError>
                          {errors.customerComplaint.message}
                        </FieldError>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Máximo 500 caracteres.
                        </p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="customerNotes">
                        Notas del cliente (opcional)
                      </Label>
                      <Textarea
                        id="customerNotes"
                        className="bg-card"
                        placeholder="Observaciones adicionales del cliente..."
                        rows={3}
                        maxLength={1000}
                        aria-invalid={!!errors.customerNotes}
                        {...register("customerNotes")}
                      />
                      {errors.customerNotes ? (
                        <FieldError>{errors.customerNotes.message}</FieldError>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Máximo 1000 caracteres.
                        </p>
                      )}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="internalNotes">
                        Notas internas (opcional)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Solo las ve tu taller. Máximo 1000 caracteres.
                      </p>
                      <Textarea
                        id="internalNotes"
                        className="bg-card"
                        placeholder="Ej.: Tel. alternativo: 11 2233 4455, entrega a las 18 hs."
                        rows={3}
                        maxLength={1000}
                        aria-invalid={!!errors.internalNotes}
                        {...register("internalNotes")}
                      />
                      {errors.internalNotes && (
                        <FieldError>{errors.internalNotes.message}</FieldError>
                      )}
                    </div>
                </FormSection>

                {/* Grupo 4 — Contacto (propietario) */}
                <FormSection
                  value="contacto"
                  title="Contacto"
                  status={toStatus(sectionStatus.contacto)}
                  description={SECTION_DESCRIPTIONS.contacto}
                >
                    <OwnerPhoneFields
                      form={form}
                      unavailable={phoneUnavailable}
                    />
                </FormSection>
              </FormSectionAccordion>

              {submitError && (
                <Callout variant="destructive" role="alert">
                  {submitError}
                </Callout>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || branches.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  "Registrar atención"
                )}
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function Heading() {
  return (
    <div>
      <Link
        href="/dashboard"
        className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Volver al inicio
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Nueva atención</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Registrá el ingreso (check-in) de un vehículo en el taller.
      </p>
    </div>
  );
}
