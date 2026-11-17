import type { LucideIcon } from "lucide-react"
import { cn } from "cn"

/**
 * EmptyState — estado sin información.
 *
 * Regla de producto (AGENTS.md §5): siempre explica qué falta, por qué importa
 * y qué puede hacer el usuario; nunca "No data".
 *
 * `compact` reduce el aire vertical cuando el estado vive dentro de una tarjeta
 * que ya tiene padding (ej. galería de evidencias). El icono es decorativo: el
 * título y la descripción son la señal.
 */
interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  /** Reduce el padding vertical (uso dentro de tarjetas). */
  compact?: boolean
  /** Permite subir la jerarquía del título en terminales de página. */
  titleClassName?: string
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
  titleClassName,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6" : "py-12",
        className
      )}
    >
      {Icon && (
        <div
          aria-hidden="true"
          className={cn(
            "rounded-full bg-muted",
            compact ? "mb-3 p-2.5" : "mb-4 p-3"
          )}
        >
          <Icon
            className={cn(
              "text-muted-foreground",
              compact ? "h-5 w-5" : "h-6 w-6"
            )}
          />
        </div>
      )}
      <h3 className={cn("text-sm font-medium text-foreground", titleClassName)}>
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export { EmptyState }
export type { EmptyStateProps }
