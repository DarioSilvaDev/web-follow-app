"use client";

/**
 * Formulario de datos del taller — auto-servicio "Mi taller"
 * (DECISION-REGISTER PROD-001, PROD-002, PROD-005, PROD-006).
 *
 * Contrato: `PATCH /workshops/:id` (`UpdateWorkshopDto` = PartialType de
 * `CreateWorkshopDto`) con `WorkshopGuard` + `PermissionsGuard`
 * (`workshop.update`, seedeado al rol `owner`).
 *
 * Campos que completar (PROD-002, PROD-005, PROD-006): nombre, razón social,
 * CUIT, email, teléfono, sitio web y descripción. Los `MaxLength` replican los
 * del backend para fallar en UX antes que en el servidor.
 *
 * CUIT: validación sintáctica (11 dígitos + dígito verificador). Sin consulta a
 * AFIP/ARCA en el MVP (decisión PM, EP-3 = no). El backend todavía no valida
 * el CUIT (BE-006): esto es UX, no la frontera de integridad del servidor.
 *
 * `name` antes era de solo lectura en la UI con la nota *"Tal como lo registró
 * el administrador. No puede modificarse aquí"*, aunque el backend siempre lo
 * aceptó. Esa asimetría se elimina acá (PROD-005): renombrar el taller no
 * altera el historial ya registrado.
 *
 * Sobre permisos: `/auth/me` todavía no expone el permiso efectivo por
 * membresía (`BE-004`, pendiente). Por eso el formulario NO se autodeshabilita
 * por rol —sería autorización heurística (FR-004)— y solo reacciona al 403,
 * momento en el que pasa a modo lectura con el motivo (PROD-003). El
 * enforcement real es del backend.
 *
 * UX (etapas 0-2 del handoff en `docs/workshop-profile-form-ux-handoff.md`):
 * secciones con `SectionHeader`, campos con `FormField`, validadores
 * compartidos, feedback al blur, contador de caracteres y estado de guardado.
 * No se agregó descarta-confirmación ni máscaras nuevas: quedan para etapas
 * posteriores (requieren Diálogo y decisión de producto, respectivamente).
 */

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/ui/section-header";
import { FormField } from "@/components/forms/form-field";
import { workshopApi } from "@/lib/api";
import { TourLauncher } from "@/components/onboarding/tour-launcher";
import { formatCuit } from "@/lib/cuit";
import { optionalCuit, optionalEmail, optionalText } from "@/lib/entity-form-schema";
import {
  toFormValues,
  toSubmitValues,
  toUpdateWorkshopPayload,
} from "@/lib/workshop-profile";
import { resolveUpdateWorkshopError } from "@/lib/workshop-errors";
import type { WorkshopDetail } from "@/types/workshop";

const workshopProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ingresá el nombre del taller.")
    .max(150, "El nombre no puede superar los 150 caracteres."),
  legalName: optionalText(200, "La razón social"),
  taxId: optionalCuit(),
  email: optionalEmail(),
  phone: optionalText(30, "El teléfono"),
  website: z
    .string()
    .trim()
    .max(200, "El sitio web no puede superar los 200 caracteres.")
    .optional()
    .or(z.literal("")),
  description: optionalText(200, "La descripción"),
});

type WorkshopProfileValues = z.infer<typeof workshopProfileSchema>;

const DESCRIPTION_MAX = 200;
const COUNTER_WARNING_FROM = 180;

interface WorkshopProfileFormProps {
  workshop: WorkshopDetail;
}

export function WorkshopProfileForm({ workshop }: WorkshopProfileFormProps) {
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  // FR-004: no se infiere el permiso desde el rol. Solo un 403 real habilita
  // este estado; antes de eso el formulario opera y el backend decide.
  const [accessDenied, setAccessDenied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting, isDirty, isValid },
  } = useForm<WorkshopProfileValues>({
    resolver: zodResolver(workshopProfileSchema),
    mode: "onBlur",
    defaultValues: toFormValues(workshop),
  });

  const description = useWatch({ control, name: "description" }) ?? "";

  // Tras un guardado exitoso el backend devuelve la entidad SIN branches
  // embebidas, así que se refetchea el detalle completo y se resetea el form.
  useEffect(() => {
    if (!successBanner) return;
    const timer = setTimeout(() => setSuccessBanner(null), 4000);
    return () => clearTimeout(timer);
  }, [successBanner]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await workshopApi.updateWorkshop(workshop.id, toUpdateWorkshopPayload(values));
      await queryClient.invalidateQueries({
        queryKey: ["workshop", workshop.id],
      });
      // El listado `/workshops` muestra el nombre (`workshops/page.tsx:32`).
      await queryClient.invalidateQueries({ queryKey: ["workshops-mine"] });
      reset(toSubmitValues(values));
      setSuccessBanner("Los datos del taller se actualizaron.");
    } catch (error) {
      if ((error as { status?: number })?.status === 403) {
        setAccessDenied(true);
      }
      setSubmitError(resolveUpdateWorkshopError(error));
    }
  });

  if (accessDenied) {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">No tenés permisos para editar</p>
          <p className="text-sm text-muted-foreground">
            Necesitás permiso de administrador del taller para editar estos
            datos. Contactá al dueño del taller si necesitás modificarlos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex justify-end">
        <TourLauncher tourId="profile" label="Ver tutorial: Completar perfil" />
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="sr-only">Identidad</legend>
        <SectionHeader
          as="h3"
          title="Identidad"
          description="Cómo se identifica tu taller."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            id="workshop-name"
            label="Nombre"
            required
            error={errors.name?.message}
          >
            <Input type="text" {...register("name")} />
          </FormField>

          <FormField
            id="workshop-legal-name"
            label="Razón social"
            optional
            error={errors.legalName?.message}
          >
            <Input type="text" {...register("legalName")} />
          </FormField>

          <FormField
            id="workshop-tax-id"
            label="CUIT"
            optional
            className="md:col-span-2"
            error={errors.taxId?.message}
            hint="11 dígitos, con o sin guiones. Validamos el formato, no la situación fiscal."
          >
            <Input
              type="text"
              inputMode="numeric"
              placeholder="30-12345678-9"
              {...register("taxId")}
              onChange={(event) =>
                // Formato progresivo `XX-XXXXXXXX-X`. Va después del spread de
                // `register` para pisar su handler. No revalida en cada tecla:
                // el error aparece al blur o al enviar, no mientras se tipea.
                setValue("taxId", formatCuit(event.target.value))
              }
            />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t border-border pt-5">
        <legend className="sr-only">Contacto</legend>
        <SectionHeader
          as="h3"
          title="Contacto"
          description="Cómo pueden comunicarse con el taller."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            id="workshop-email"
            label="Email"
            optional
            error={errors.email?.message}
          >
            <Input type="email" autoComplete="email" {...register("email")} />
          </FormField>

          <FormField
            id="workshop-phone"
            label="Teléfono"
            optional
            error={errors.phone?.message}
          >
            <Input type="tel" autoComplete="tel" {...register("phone")} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 border-t border-border pt-5">
        <legend className="sr-only">Presencia online</legend>
        <SectionHeader
          as="h3"
          title="Presencia online"
          description="Sitio web y descripción del taller."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            id="workshop-website"
            label="Sitio web"
            optional
            error={errors.website?.message}
          >
            <Input
              data-tour="workshop-input-website"
              type="text"
              placeholder="ej. mitaller.com.ar"
              {...register("website")}
            />
          </FormField>

          <FormField
            id="workshop-description"
            label="Descripción"
            optional
            className="md:col-span-2"
            error={errors.description?.message}
            labelEnd={
              <span
                className={`text-xs tabular-nums ${
                  description.length >= COUNTER_WARNING_FROM
                    ? "font-medium text-warning"
                    : "text-muted-foreground"
                }`}
                aria-live="polite"
              >
                {description.length}/{DESCRIPTION_MAX}
              </span>
            }
            hint="Estos datos son públicos: los ven tus clientes."
          >
            <Textarea
              data-tour="workshop-input-description"
              rows={4}
              maxLength={DESCRIPTION_MAX}
              placeholder="Contá qué hace el taller. Tus clientes lo ven."
              {...register("description")}
            />
          </FormField>
        </div>
      </fieldset>

      {successBanner && <Callout variant="success">{successBanner}</Callout>}

      {submitError && (
        <Callout variant="destructive" role="alert">
          {submitError}
        </Callout>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span
          className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
          role="status"
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          {isDirty ? "Cambios sin guardar" : "Sin cambios"}
        </span>
        <Button
          type="submit"
          disabled={isSubmitting || !isDirty || !isValid}
          data-tour="workshop-btn-guardar-datos"
        >
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isSubmitting ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
