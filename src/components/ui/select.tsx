import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"

/**
 * Minimal native select styled consistently with the shadcn/ui Input.
 * Used for the optional catalog cascade (brand → model → version).
 * A native select keeps the MVP form simple and fully testable;
 * a portal-based Base UI Select is not needed yet.
 *
 * La lista desplegada es siempre la nativa del SO (no estilizable);
 * el chrome visual se logra con `appearance-none` + chevron decorativo.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative w-full">
      <select
        data-slot="select"
        className={cn(
          "h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent px-2.5 py-1 pr-9 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className,
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { Select }