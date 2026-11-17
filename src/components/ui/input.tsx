import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

/**
 * `sanitize` filtra caracteres no válidos ANTES de que el consumidor
 * (p. ej. react-hook-form) lea el valor: "digits" deja solo ASCII 0-9,
 * para campos numéricos de texto libre (kilometraje, año, teléfono).
 */
function Input({ className, type, sanitize, onChange, ...props }: React.ComponentProps<"input"> & { sanitize?: "digits" }) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (sanitize === "digits") {
      event.target.value = event.target.value.replace(/\D/g, "")
    }
    onChange?.(event)
  }
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
      onChange={handleChange}
    />
  )
}

export { Input }
