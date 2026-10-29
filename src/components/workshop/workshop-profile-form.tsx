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
 * AFIP/ARCA en el MVP (decisión PM, EP-3 = no).
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
 */

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { workshopApi } from "@/lib/api";
import { formatCuit, isValidCuit } from "@/lib/cuit";
import { resolveUpdateWorkshopError } from "@/lib/workshop-errors";
import type { WorkshopDetail } from "@/types/workshop";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} no puede superar los ${max} caracteres.`)
    .optional()
    .or(z.literal(""));

const workshopProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ingresá el nombre del taller.")
    .max(150, "El nombre no puede superar los 150 caracteres."),
  legalName: optionalText(200, "La razón social"),
  taxId: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || isValidCuit(value), {
      message: "El CUIT no es válido. Revisá los 11 dígitos.",
    }),
  email: z
    .string()
    .trim()
    .email("Ingresá un email válido.")
    .optional()
    .or(z.literal("")),
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
    formState: { errors, isSubmitting },
  } = useForm<WorkshopProfileValues>({
    resolver: zodResolver(workshopProfileSchema),
    defaultValues: {
      name: workshop.name ?? "",
      legalName: workshop.legalName ?? "",
      // El backend normaliza `taxId` a solo dígitos (D-162) para que el índice
      // único de `tax_id` detecte duplicados. Si se mostrara crudo, el usuario
      // vería `30123456789` después del reload y `30-12345678-9` mientras edita:
      // dos formas para el mismo dato. `formatCuit` devuelve el input sin tocar
      // si no tiene 11 dígitos, así que es seguro con valores no normalizados.
      taxId: formatCuit(workshop.taxId ?? ""),
      email: workshop.email ?? "",
      phone: workshop.phone ?? "",
      website: workshop.website ?? "",
      description: workshop.description ?? "",
    },
  });

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
      await workshopApi.updateWorkshop(workshop.id, {
        name: values.name.trim(),
        legalName: values.legalName?.trim() || null,
        taxId: values.taxId?.trim() || null,
        email: values.email?.trim() || null,
        phone: values.phone?.trim() || null,
        website: values.website?.trim() || null,
        description: values.description?.trim() || null,
      });
      await queryClient.invalidateQueries({
        queryKey: ["workshop", workshop.id],
      });
      // El listado `/workshops` muestra el nombre (`workshops/page.tsx:32`).
      await queryClient.invalidateQueries({ queryKey: ["workshops-mine"] });
      reset({
        name: values.name.trim(),
        legalName: values.legalName?.trim() ?? "",
        taxId: values.taxId?.trim() ?? "",
        email: values.email?.trim() ?? "",
        phone: values.phone?.trim() ?? "",
        website: values.website?.trim() ?? "",
        description: values.description?.trim() ?? "",
      });
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
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workshop-name">
            Nombre <span className="text-destructive">*</span>
          </Label>
          <Input
            id="workshop-name"
            type="text"
            aria-invalid={Boolean(errors.name)}
            {...register("name")}
          />
          {errors.name && (
            <p className="text-xs text-destructive" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workshop-legal-name">Razón social</Label>
          <Input
            id="workshop-legal-name"
            type="text"
            aria-invalid={Boolean(errors.legalName)}
            {...register("legalName")}
          />
          {errors.legalName && (
            <p className="text-xs text-destructive" role="alert">
              {errors.legalName.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workshop-tax-id">CUIT</Label>
          <Input
            id="workshop-tax-id"
            type="text"
            inputMode="numeric"
            placeholder="30-12345678-9"
            aria-invalid={Boolean(errors.taxId)}
            {...register("taxId")}
            onChange={(event) =>
              // Formato progresivo `XX-XXXXXXXX-X`. Va después del spread de
              // `register` para pisar su handler. No revalida en cada tecla:
              // el error aparece al blur o al enviar, no mientras se tipea.
              setValue("taxId", formatCuit(event.target.value))
            }
          />
          {errors.taxId && (
            <p className="text-xs text-destructive" role="alert">
              {errors.taxId.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workshop-email">Email</Label>
          <Input
            id="workshop-email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workshop-phone">Teléfono</Label>
          <Input
            id="workshop-phone"
            type="tel"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
            {...register("phone")}
          />
          {errors.phone && (
            <p className="text-xs text-destructive" role="alert">
              {errors.phone.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workshop-website">Sitio web</Label>
          <Input
            id="workshop-website"
            type="text"
            placeholder="ej. mitaller.com.ar"
            aria-invalid={Boolean(errors.website)}
            {...register("website")}
          />
          {errors.website && (
            <p className="text-xs text-destructive" role="alert">
              {errors.website.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="workshop-description">Descripción</Label>
        <Textarea
          id="workshop-description"
          rows={4}
          placeholder="Contá qué hace el taller. Tus clientes lo ven."
          aria-invalid={Boolean(errors.description)}
          {...register("description")}
        />
        {errors.description && (
          <p className="text-xs text-destructive" role="alert">
            {errors.description.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Estos datos son públicos: los ven tus clientes.
        </p>
      </div>

      {successBanner && (
        <p
          role="status"
          className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success-foreground"
        >
          {successBanner}
        </p>
      )}

      {submitError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {submitError}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isSubmitting ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}