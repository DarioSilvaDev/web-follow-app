import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Estados semánticos como pill TINTADO (Design System Autentia):
// fondo del tono al 10-15%, borde al 40-50% y texto en color de primer plano.
// El pill sólido con texto blanco no alcanza contraste AA (success daba 3.39:1);
// el tintado mide 12:1 o más en light y dark. El tono del icono se hereda vía
// selector de descendencia para que el estado siga siendo reconocible sin
// depender solo del color (el texto es la señal principal).
// `default` (primary sólido), `secondary` y `outline` quedan como estaban.
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-destructive/40 bg-destructive/10 text-foreground [&_svg]:text-destructive",
        outline: "text-foreground",
        success:
          "border-success/40 bg-success/12 text-foreground [&_svg]:text-success",
        warning:
          "border-warning/50 bg-warning/15 text-foreground [&_svg]:text-warning",
        info:
          "border-info/40 bg-info/12 text-foreground [&_svg]:text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
