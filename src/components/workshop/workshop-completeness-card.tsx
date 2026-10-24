"use client";

/**
 * Checklist de completitud del taller (DECISION-REGISTER PROD-004 / FR-006).
 *
 * Es **informativo**: no bloquea ninguna operación. La única excepción
 * deliberada —al menos una sucursal activa para registrar una atención— vive
 * en `/atenciones/nueva` y no acá.
 *
 * Accesibilidad (FR-006): cada ítem combina ícono + texto + borde. El color
 * nunca es el único portador de significado (WCAG 1.4.1), y el checklist no
 * se reduce a un contador "5/6" sin etiquetar cada ítem.
 */

import { CheckCircle2, Circle, MoveRight } from "lucide-react";
import { getWorkshopCompleteness } from "@/lib/workshop-completeness";
import type { WorkshopDetail } from "@/types/workshop";

interface WorkshopCompletenessCardProps {
  workshop: WorkshopDetail;
  /** Lleva a la sección donde el ítem se puede completar. */
  onNavigate?: (section: "datos" | "sucursales") => void;
}

export function WorkshopCompletenessCard({
  workshop,
  onNavigate,
}: WorkshopCompletenessCardProps) {
  const summary = getWorkshopCompleteness(workshop);

  if (summary.isComplete) {
    return (
      <div className="rounded-lg border border-success/40 bg-success/10 p-4">
        <p className="text-sm font-medium text-success-foreground">
          Tu taller está completo
        </p>
        <p className="mt-1 text-sm text-success-foreground/80">
          Todos los datos básicos están cargados.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          Tu taller está al {summary.percent}% completo
        </p>
        <p className="text-xs text-muted-foreground">
          {summary.completed} de {summary.total} datos
        </p>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${summary.completed} de ${summary.total} datos cargados`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${summary.percent}%` }}
        />
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {summary.items.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5 text-sm">
            {item.complete ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
            )}
            <span className={item.complete ? "text-muted-foreground" : undefined}>
              <span className="font-medium">{item.label}</span>
              {!item.complete && (
                <>
                  <span className="text-muted-foreground"> — {item.hint}</span>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate(item.section)}
                      className="ml-1.5 inline-flex items-center gap-0.5 font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Ir
                      <MoveRight className="h-3 w-3" />
                    </button>
                  )}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-muted-foreground">
        Estos datos son públicos: los ven tus clientes.
      </p>
    </div>
  );
}