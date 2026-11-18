import { cn } from "cn";
import { Card, CardContent, CardHeader } from "./card";
import { SectionHeader } from "./section-header";

/**
 * InfoCard — contenedor de información (Design System Autentia).
 *
 * Una sola superficie para las tarjetas de contenido: radio de 16px
 * (`rounded-card`, heredado de `Card`), borde suave (`ring`) y sombra de
 * reposo. Evita que cada pantalla reinvente paddings y jerarquías.
 *
 * Dos formas de encabezado:
 * - `title` / `count` / `description` / `action` → `SectionHeader` estándar.
 * - `header` → slot libre (ej. un `PageTitle` con título grande + badges).
 *
 * El `<Card>` real es el que aporta padding (16px) y superficie; este
 * componente solo compone header + contenido.
 */
export interface InfoCardProps
  extends Omit<React.ComponentProps<"div">, "title" | "content"> {
  /** Encabezado libre; tiene prioridad sobre `title`. */
  header?: React.ReactNode;
  title?: React.ReactNode;
  /** Contador del header ("2 archivos"). */
  count?: React.ReactNode;
  description?: React.ReactNode;
  /** Acción a la derecha del header. */
  action?: React.ReactNode;
  children?: React.ReactNode;
}

function InfoCard({
  header,
  title,
  count,
  description,
  action,
  children,
  className,
  ...props
}: InfoCardProps) {
  const hasHeader = header !== undefined || title !== undefined;

  return (
    <Card className={cn("shadow-card", className)} {...props}>
      {hasHeader ? (
        <CardHeader className="gap-2">
          {header ?? (
            <SectionHeader
              title={title}
              count={count}
              description={description}
              action={action}
            />
          )}
        </CardHeader>
      ) : null}
      {/* gap-4 = 16px, el mismo valor que `--spacing-card`; se usa la utilidad
          numérica para que `cn()` pueda pisarla sin ambigüedad. */}
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

export { InfoCard };
