import { cn } from "cn";
import { typeScale } from "./type-scale";

/**
 * InfoField — par etiqueta/valor (Design System Autentia).
 *
 * Etiqueta 12px en gris con icono opcional de 18px y valor 15px en primer
 * plano, separados por 6px (`--spacing-label`). Reemplaza los pares ad-hoc
 * que se repetían pantalla por pantalla.
 *
 * Accesibilidad: el texto de la etiqueta precede al valor en el DOM (orden de
 * lectura natural) y el icono es decorativo (`aria-hidden`), nunca la única
 * señal. El valor admite `valueClassName` para `whitespace-pre-wrap` en textos
 * largos.
 */
export interface InfoFieldProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Icono lucide decorativo (18px). */
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  className?: string;
  valueClassName?: string;
}

function InfoField({
  label,
  value,
  icon: Icon,
  className,
  valueClassName,
}: InfoFieldProps) {
  return (
    <div className={cn("grid min-w-0 gap-label", className)}>
      <p
        className={cn(
          "flex items-center gap-1.5 text-muted-foreground",
          typeScale.meta,
        )}
      >
        {Icon ? (
          <Icon className="size-[18px] shrink-0" aria-hidden />
        ) : null}
        <span className="min-w-0">{label}</span>
      </p>
      <p
        className={cn(
          "min-w-0 font-medium break-words text-foreground",
          typeScale.body,
          valueClassName,
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * InfoGrid — grilla de campos.
 *
 * 2 columnas desde `sm` (una sola en mobile, sin scroll horizontal) y 16px
 * de separación entre campos (`--spacing-field`).
 */
export interface InfoGridProps {
  columns?: 1 | 2;
  className?: string;
  children: React.ReactNode;
}

function InfoGrid({ columns = 2, className, children }: InfoGridProps) {
  return (
    <div
      className={cn(
        "grid gap-field",
        columns === 2 && "sm:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export { InfoField, InfoGrid };
