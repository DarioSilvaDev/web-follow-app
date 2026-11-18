import { cn } from "cn";
import { typeScale } from "./type-scale";

/**
 * SectionHeader — título de sección con contador opcional.
 *
 * Pensado para bloques dentro de una tarjeta ("Información del servicio",
 * "Evidencias", "General"): título 18px semibold y contador 12px gris
 * (`2 fotografías`) alineado a la derecha, sin competir con el título.
 *
 * El contador va DENTRO del heading a propósito: el lector de pantalla
 * anuncia "Evidencias, 2 archivos" y no queda como texto suelto.
 */
export interface SectionHeaderProps {
  title: React.ReactNode;
  /** Contador o metadato corto ("2 archivos", "3 registros"). */
  count?: React.ReactNode;
  description?: React.ReactNode;
  /** Acción alineada a la derecha (botón, link). */
  action?: React.ReactNode;
  as?: "h2" | "h3" | "h4";
  className?: string;
}

function SectionHeader({
  title,
  count,
  description,
  action,
  as: Heading = "h2",
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-2",
        className,
      )}
    >
      <div className="min-w-0">
        <Heading
          className={cn(
            "flex flex-wrap items-baseline gap-x-2 font-semibold text-foreground",
            typeScale.title,
          )}
        >
          <span className="min-w-0">{title}</span>
          {count !== null && count !== undefined ? (
            <span
              className={cn("font-normal text-muted-foreground", typeScale.meta)}
            >
              {count}
            </span>
          ) : null}
        </Heading>
        {description ? (
          <p className={cn("mt-1 text-muted-foreground", typeScale.label)}>
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export { SectionHeader };
