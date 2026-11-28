"use client";

/**
 * FormField — wrapper de campo para formularios (perfil de taller, sucursales,
 * y cualquier formulario de entidad que use `react-hook-form`).
 *
 * NO es un form builder: solo centraliza el patrón repetido
 * `Label → control → error`, y agrega la relación accesible entre el control,
 * su ayuda y su error (`aria-describedby`). Los esquemas y DTOs siguen siendo
 * propios de cada pantalla.
 *
 * El control se pasa como hijo y se clona para inyectar `id`, `aria-invalid`
 * y `aria-describedby`; por eso funciona con `Input`, `Textarea` y cualquier
 * primitive de `@base-ui/react` que acepte esos props. El `onChange` del hijo
 * se conserva (necesario para máscaras como la del CUIT).
 */

import { cloneElement, type ReactElement, type ReactNode } from "react";
import { cn } from "cn";
import { Label } from "@/components/ui/label";

/** Props que este wrapper inyecta en el control (Input, Textarea, primitive). */
type InjectableControl = ReactElement<Record<string, unknown>>;

interface FormFieldProps {
  id: string;
  label: ReactNode;
  /** Marca el obligatorio con asterisco rojo. */
  required?: boolean;
  /** Chip discreto para campos que el esquema permite dejar vacíos. */
  optional?: boolean;
  error?: string;
  /** Texto de apoyo; se enlaza al control con `aria-describedby`. */
  hint?: ReactNode;
  /** Contador u otro metadato alineado a la derecha del label. */
  labelEnd?: ReactNode;
  className?: string;
  children: ReactElement;
}

export function FormField({
  id,
  label,
  required = false,
  optional = false,
  error,
  hint,
  labelEnd,
  className,
  children,
}: FormFieldProps) {
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <Label htmlFor={id}>
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
          {optional ? (
            <span className="text-[11px] font-normal text-muted-foreground">
              {" "}
              (opcional)
            </span>
          ) : null}
        </Label>
        {labelEnd}
      </div>

      {cloneElement(children as unknown as InjectableControl, {
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
      })}

      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
