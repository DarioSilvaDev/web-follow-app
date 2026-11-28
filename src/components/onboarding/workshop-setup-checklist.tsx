"use client";

/**
 * Checklist "Primeros pasos del taller" (4 ítems).
 *
 * Reglas de producto:
 * - La completitud se deriva del estado REAL del dominio (WorkshopDetail +
 *   queries de especialidades y atenciones). NO se persiste en localStorage.
 * - El estado "tour visto" se lee de los flags de la sesión (BD vía
 *   GET /auth/me): `hasSeenProfileTour`, `hasSeenBranchTour`, etc.
 * - Ítem pendiente con tour NO visto → "Ver guía" (dispara Driver.js).
 * - Ítem pendiente con tour YA visto → acción directa (Completar/Crear/
 *   Configurar/Registrar).
 * - Ítem completo → check verde, sin acción.
 * - Si todo está completo → la tarjeta se oculta por completo.
 * - "Invitar al equipo" se difiere a otra etapa (no aparece hoy).
 *
 * Visual: card con bandera, progreso "X de 4 completados / NN%", lista
 * vertical con check/círculo, hint y link de acción.
 */

import { useRouter } from "next/navigation";
import { ArrowRight, Circle, CircleCheck, Flag } from "lucide-react";
import { cn } from "cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TourLauncher } from "@/components/onboarding/tour-launcher";
import { TOUR_FLAG_MAP } from "@/lib/onboarding/tour-registry";
import { type SetupSection } from "@/lib/workshop-setup";
import { useAuth } from "@/hooks/use-auth";
import { useWorkshopSetupSummary } from "@/hooks/use-workshop-setup";
import type { WorkshopDetail } from "@/types/workshop";

interface WorkshopSetupChecklistProps {
  workshop: WorkshopDetail;
  /** Total de atenciones del taller (viene del query del overview). */
  careEpisodesCount: number;
  /** Lleva a la sección donde se completa el ítem. */
  onNavigateSection: (section: SetupSection) => void;
}

export function WorkshopSetupChecklist({
  workshop,
  careEpisodesCount,
  onNavigateSection,
}: WorkshopSetupChecklistProps) {
  const router = useRouter();
  const { user } = useAuth();

  const summary = useWorkshopSetupSummary(workshop, careEpisodesCount);

  // Todo completo → ocultar la tarjeta.
  if (summary.isComplete) return null;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Flag className="size-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle className="font-serif font-semibold">
              Primeros pasos del taller
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Completá estos pasos para aprovechar al máximo Autentia.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Progreso */}
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold">
            {summary.completed} de {summary.total} completados
          </p>
          <p className="text-xs text-muted-foreground">{summary.percent}%</p>
        </div>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${summary.completed} de ${summary.total} pasos completados`}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${summary.percent}%` }}
          />
        </div>

        {/* Lista vertical */}
        <ul className="mt-4 flex flex-col">
          {summary.items.map((item) => {
            const flagKey = TOUR_FLAG_MAP[item.tourId];
            const tourSeen = Boolean(
              user && (user as unknown as Record<string, boolean>)[flagKey],
            );

            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-start gap-2.5 border-t border-border py-2.5 text-xs first:border-t-0",
                  item.complete && "opacity-70",
                )}
              >
                {item.complete ? (
                  <CircleCheck
                    className="mt-px size-4 shrink-0 text-success"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle
                    className="mt-px size-4 shrink-0 text-muted-foreground/50"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "font-semibold",
                      item.complete && "text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </p>
                  {!item.complete && (
                    <>
                      <p className="mt-0.5 text-muted-foreground">{item.hint}</p>
                      <div className="mt-1">
                        {tourSeen ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (item.href) {
                                router.push(item.href);
                              } else if (item.section) {
                                onNavigateSection(item.section);
                              }
                            }}
                            className="inline-flex items-center gap-0.5 font-bold text-primary underline underline-offset-2 hover:text-primary-hover"
                          >
                            {item.actionLabel}
                            <ArrowRight className="size-3" aria-hidden="true" />
                          </button>
                        ) : (
                          <TourLauncher
                            tourId={item.tourId}
                            label="Ver guía →"
                            variant="ghost"
                            size="sm"
                            showIcon={false}
                            className="-ml-2 h-auto p-0 font-bold text-primary underline underline-offset-2 hover:text-primary-hover"
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
          El checklist es informativo: no bloquea la operación.
        </p>
      </CardContent>
    </Card>
  );
}
