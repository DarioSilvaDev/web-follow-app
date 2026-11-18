import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

/**
 * Callout — banner inline de notificación (feedback de mutaciones/estados).
 *
 * Convención del repo: sin toasts; el feedback es inline con `role="status"`
 * (resultado informativo/éxito) o `role="alert"` (error). Este componente
 * unifica la presentación que antes se duplicaba ad-hoc en cada pantalla.
 *
 * Contraste WCAG AA/AAA verificado (tokens de globals.css, tema light y dark):
 * `text-foreground` sobre `bg-<variant>/10` da ≥13:1 en todas las variantes.
 * NO usar `text-success-foreground` sobre tintes: en theme light esa
 * combinación dio 1.07:1 (texto ilegible — el bug original del banner de
 * "/atenciones/nueva").
 */
const calloutVariants = cva(
  "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
  {
    variants: {
      variant: {
        success:
          "border-success bg-success/10 text-foreground [&_svg]:text-success",
        warning:
          "border-warning bg-warning/10 text-foreground [&_svg]:text-warning",
        info: "border-info bg-info/10 text-foreground [&_svg]:text-info",
        destructive:
          "border-destructive bg-destructive/10 text-foreground [&_svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "success",
    },
  },
);

export interface CalloutProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof calloutVariants> {
  /** Icono lucide temático; decorativo (`aria-hidden`), el texto es la señal. */
  icon?: LucideIcon;
  /** `status` = resultado OK/informativo; `alert` = error (ambos ARIA live). */
  role?: "status" | "alert";
}

function Callout({
  variant = "success",
  icon: Icon,
  role = "status",
  className,
  children,
  ...props
}: CalloutProps) {
  return (
    <div
      role={role}
      className={cn(calloutVariants({ variant }), className)}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export { Callout, calloutVariants };
