"use client";

/**
 * Sucursales del taller — auto-servicio "Mi taller"
 * (DECISION-REGISTER PROD-001, PROD-003).
 *
 * ALCANCE DE ESTA ITERACIÓN: **alta y lectura**. No hay edición, ni
 * desactivación, ni horarios.
 *
 * Por qué: `POST /workshops/:id/branches` sí existe (`workshop.branch.create`),
 * pero NO existen `GET /:id/branches`, `PATCH /:id/branches/:branchId` ni
 * desactivar (`BE-002`, pendiente en backend). Además `GET /workshops/:id`
 * devuelve únicamente sucursales **activas** y no hay forma de listar las
 * inactivas: sin el endpoint de listado, una sucursal desactivada quedaría
 * inaccesible e inmanejable. Implementar edición o baja antes de ese endpoint
 * produciría datos irrecuperables.
 *
 * Los horarios quedan fuera por la misma razón: existe
 * `POST /:id/branches/:branchId/hours` (`workshop.hours.set`) pero no existe su
 * getter, y escribir sin poder leer preclude sobrescribir a ciegas.
 *
 * Esta pantalla es la que cierra el bloqueo funcional del taller: `/atenciones/
 * nueva` deshabilita el submit cuando no hay sucursales activas, y hasta ahora
 * no existía ninguna forma de crear la primera.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Building2, Loader2, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { workshopApi } from "@/lib/api";
import { resolveCreateBranchError } from "@/lib/workshop-errors";
import type { WorkshopDetail } from "@/types/workshop";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} no puede superar los ${max} caracteres.`)
    .optional()
    .or(z.literal(""));

const branchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ingresá el nombre de la sucursal.")
    .max(120, "El nombre no puede superar los 120 caracteres."),
  phone: optionalText(30, "El teléfono"),
  email: z
    .string()
    .trim()
    .email("Ingresá un email válido.")
    .optional()
    .or(z.literal("")),
  street: optionalText(200, "La calle"),
  streetNumber: optionalText(20, "El número"),
  city: optionalText(80, "La ciudad"),
  state: optionalText(80, "La provincia"),
  postalCode: optionalText(20, "El código postal"),
  isHeadquarters: z.boolean(),
});

type BranchValues = z.infer<typeof branchSchema>;

interface WorkshopBranchesSectionProps {
  workshop: WorkshopDetail;
}

export function WorkshopBranchesSection({
  workshop,
}: WorkshopBranchesSectionProps) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  // `GET /workshops/:id` ordena por `isHeadquarters desc`: la sede ya viene
  // primera, pero el orden no es un contrato de la API — se ordena acá para no
  // depender de él.
  const branches = [...(workshop.branches ?? [])].sort(
    (a, b) => Number(b.isHeadquarters) - Number(a.isHeadquarters),
  );

  const hasHeadquarters = branches.some((branch) => branch.isHeadquarters);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BranchValues>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      street: "",
      streetNumber: "",
      city: "",
      state: "",
      postalCode: "",
      // La primera sucursal creada es la sede por defecto: si no hay ninguna,
      // no tiene sentido pedir que lo decida el usuario.
      isHeadquarters: !hasHeadquarters,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await workshopApi.createBranch(workshop.id, {
        name: values.name.trim(),
        phone: values.phone?.trim() || null,
        email: values.email?.trim() || null,
        street: values.street?.trim() || null,
        streetNumber: values.streetNumber?.trim() || null,
        city: values.city?.trim() || null,
        state: values.state?.trim() || null,
        postalCode: values.postalCode?.trim() || null,
        // Se refuerza acá y no solo en el `disabled`: un input deshabilitado no
        // emite cambios, pero el valor no debe depender de ese detalle de RHF.
        isHeadquarters: values.isHeadquarters && !hasHeadquarters,
      });
      await queryClient.invalidateQueries({
        queryKey: ["workshop", workshop.id],
      });
      reset();
      setShowForm(false);
      setSuccessBanner("La sucursal se agregó.");
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (error) {
      if ((error as { status?: number })?.status === 403) {
        setAccessDenied(true);
        setShowForm(false);
      }
      setSubmitError(resolveCreateBranchError(error));
    }
  });

  return (
    <div className="flex flex-col gap-5">
      {branches.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Todavía no tenés sucursales"
          description="Registrá la sede donde recibís vehículos para poder registrar atenciones."
          action={
            !accessDenied ? (
              <Button type="button" size="sm" onClick={() => setShowForm(true)}>
                Agregar la primera sucursal
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {branches.map((branch) => (
            <li
              key={branch.id}
              className="rounded-lg border p-4 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{branch.name}</span>
                {branch.isHeadquarters && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                    Sede
                  </span>
                )}
              </div>
              {(branch.street || branch.city) && (
                <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {[branch.street, branch.streetNumber, branch.city, branch.state]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              {branch.phone && (
                <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  {branch.phone}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {branches.length > 0 && !accessDenied && !showForm && (
        <div>
          <Button type="button" variant="outline" onClick={() => setShowForm(true)}>
            Agregar sucursal
          </Button>
        </div>
      )}

      {accessDenied && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Necesitás permiso de administrador del taller para agregar sucursales.
        </p>
      )}

      {successBanner && (
        <p
          role="status"
          className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success-foreground"
        >
          {successBanner}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 rounded-lg border p-4"
          noValidate
        >
          <h3 className="text-sm font-medium">Nueva sucursal</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="branch-name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="branch-name"
                type="text"
                placeholder="Ej. Sede Central"
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
              <Label htmlFor="branch-phone">Teléfono</Label>
              <Input
                id="branch-phone"
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
              <Label htmlFor="branch-email">Email</Label>
              <Input
                id="branch-email"
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
              <Label htmlFor="branch-city">Ciudad</Label>
              <Input
                id="branch-city"
                type="text"
                aria-invalid={Boolean(errors.city)}
                {...register("city")}
              />
              {errors.city && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.city.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="branch-street">Calle</Label>
              <Input
                id="branch-street"
                type="text"
                aria-invalid={Boolean(errors.street)}
                {...register("street")}
              />
              {errors.street && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.street.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="branch-street-number">Número</Label>
              <Input
                id="branch-street-number"
                type="text"
                aria-invalid={Boolean(errors.streetNumber)}
                {...register("streetNumber")}
              />
              {errors.streetNumber && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.streetNumber.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="branch-state">Provincia</Label>
              <Input
                id="branch-state"
                type="text"
                aria-invalid={Boolean(errors.state)}
                {...register("state")}
              />
              {errors.state && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.state.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="branch-postal-code">Código postal</Label>
              <Input
                id="branch-postal-code"
                type="text"
                aria-invalid={Boolean(errors.postalCode)}
                {...register("postalCode")}
              />
              {errors.postalCode && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.postalCode.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <input
              id="branch-is-headquarters"
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border"
              // Una sede por taller. El backend todavía NO lo garantiza (BE-003,
              // índice único parcial pendiente), así que esta restricción es
              // mitigación de UX, no enforcement: se refuerza en el payload.
              disabled={hasHeadquarters}
              {...register("isHeadquarters")}
            />
            <Label
              htmlFor="branch-is-headquarters"
              className={hasHeadquarters ? "font-normal opacity-60" : "font-normal"}
            >
              Esta es la sede principal
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {hasHeadquarters
              ? "Ya tenés una sede principal. Por ahora no se puede cambiarla desde acá."
              : "La sede principal se muestra primero en los listados."}
          </p>

          {submitError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isSubmitting ? "Agregando…" : "Agregar sucursal"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}