"use client";

/**
 * Resumen operativo del taller — primer tab de `/workshops/[id]`.
 *
 * Por qué existe: el detalle abría en "Datos" (formulario de configuración).
 * Para un miembro que entra a prestar servicio, el primer tab debe responder
 * "¿qué está pasando en mi taller?" y ofrecer las acciones del día.
 *
 * Diseño (según prototipo validado):
 * - Las 3 tarjetas KPI son clickeables y llevan a su sección: icono en círculo
 *   tintado, valor a la derecha, etiqueta/hint debajo y link en la esquina
 *   superior derecha.
 * - "Atenciones recientes" usa el template ÚNICO de `CareEpisodeTable` (mismo
 *   que `/atenciones`): 4 columnas en desktop, filas apiladas en mobile.
 * - El onboarding terminado es un indicador discreto ("Perfil del taller
 *   completo"), no un bloque grande. Los mensajes grandes se reservan para
 *   situaciones que requieren atención (datos pendientes, doc. incompleta,
 *   verificaciones pendientes, problemas con sucursales).
 *
 * Datos (todos con contrato existente, sin inventar endpoints):
 * - `GET /care-episodes?signed=true` (contexto WORKSHOP) → últimas atenciones
 *   + total + `vehicle.primaryPhoto` (D-213, miniatura firmada por fila).
 * - `GET /care-episodes/verifications` → cola de verificaciones pendientes.
 * - `workshop.branches` / `branchCount` → sucursales activas.
 * - `WorkshopSetupChecklist` → checklist derivado del estado real del taller.
 *   Cuando está completo se oculta y la tabla pasa a ocupar todo el ancho.
 *   Es informativo: nunca bloquea.
 *
 * Sin PII: el listado de care-episodes ya viene acotado por el backend
 * (D-F023-2). No se muestran métricas que no tengan fuente real (p. ej.
 * "turnos de hoy" no existe en este contrato).
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  RotateCw,
  Store,
  Wrench,
} from "lucide-react";
import { cn } from "cn";
import { CareEpisodeTable } from "@/components/care-episode/care-episode-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkshopSetupChecklist } from "@/components/onboarding/workshop-setup-checklist";
import { useWorkshopSetupSummary } from "@/hooks/use-workshop-setup";
import type { SetupSection } from "@/lib/workshop-setup";
import { careEpisodeApi } from "@/lib/api";
import { MEDIA_STALE_TIME } from "@/lib/constants";
import type { WorkshopDetail } from "@/types/workshop";

const RECENT_LIMIT = 5;

interface WorkshopOverviewSectionProps {
  workshop: WorkshopDetail;
  /** Lleva a la sección donde se completa un ítem del checklist. */
  onNavigateSection: (section: SetupSection) => void;
}

/**
 * Tarjeta KPI clickeable. Si se pasa `href` navega con Link; si se pasa
 * `onClick` ejecuta la acción (p. ej. cambiar de tab). Ambas excluyentes.
 * El "link" de la esquina es decorativo: toda la card es el área clickeable,
 * así no hay elementos interactivos anidados.
 */
function Stat({
  label,
  value,
  hint,
  icon: Icon,
  linkLabel,
  tone = "primary",
  href,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Wrench;
  linkLabel: string;
  tone?: "primary" | "warning";
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <Card className="h-full shadow-card transition-colors hover:bg-muted/40">
      <CardContent className="flex h-full flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full",
                tone === "warning"
                  ? "bg-warning/15 text-warning"
                  : "bg-primary/10 text-primary",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="text-2xl font-semibold tracking-tight text-foreground">
              {value}
            </span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary">
            {linkLabel}
            <ArrowRight className="size-3" aria-hidden="true" />
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block h-full w-full rounded-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </button>
    );
  }
  return content;
}

function RecentSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-lg bg-muted/60"
        />
      ))}
    </div>
  );
}

export function WorkshopOverviewSection({
  workshop,
  onNavigateSection,
}: WorkshopOverviewSectionProps) {
  const episodesQuery = useQuery({
    queryKey: ["workshop-overview-episodes", workshop.id],
    queryFn: () =>
      careEpisodeApi.listCareEpisodes({
        page: 1,
        limit: RECENT_LIMIT,
        signed: true,
      }),
    retry: false,
    // D-213: las URLs firmadas vencen en ~1 h; refetch preventivo cada 5 min
    // (por debajo del TTL) para no dejar miniaturas vencidas en una pestaña
    // abierta. React Query pausa el intervalo cuando la pestaña no está activa.
    refetchInterval: MEDIA_STALE_TIME,
  });

  const verificationsQuery = useQuery({
    queryKey: ["workshop-overview-verifications", workshop.id],
    queryFn: () => careEpisodeApi.getCareEpisodeVerifications(),
    retry: false,
  });

  const episodes = episodesQuery.data?.data ?? [];
  const totalEpisodes = episodesQuery.data?.meta.total;
  const pendingVerifications = verificationsQuery.data?.length;
  const branchesCount = workshop.branches?.length ?? workshop.branchCount ?? 0;

  // Checklist completo → no se monta su columna y la tabla ocupa todo el
  // ancho. El propio checklist sigue ocultándose por si se usa aisladamente.
  const setupComplete = useWorkshopSetupSummary(
    workshop,
    totalEpisodes ?? episodes.length,
  ).isComplete;

  const episodesHint =
    totalEpisodes === undefined
      ? "Cargando…"
      : pendingVerifications
        ? `${pendingVerifications} esperando verificación`
        : "en total";
  const verificationsHint =
    pendingVerifications === undefined
      ? "Cargando…"
      : pendingVerifications === 0
        ? "todo al día"
        : "Para revisar hoy";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Atenciones registradas"
          value={totalEpisodes ?? "—"}
          hint={episodesHint}
          icon={Wrench}
          linkLabel="Ver todas"
          href="/atenciones"
        />
        <Stat
          label="Verificaciones pendientes"
          value={pendingVerifications ?? "—"}
          hint={verificationsHint}
          icon={ClipboardCheck}
          linkLabel="Revisar"
          tone="warning"
          href="/atenciones/verificaciones"
        />
        <Stat
          label="Sucursales activas"
          value={branchesCount}
          hint={branchesCount === 0 ? "necesitás una para operar" : undefined}
          icon={Store}
          linkLabel="Ver detalle"
          onClick={() => onNavigateSection("sucursales")}
        />
      </div>

      <div
        data-testid="workshop-overview-grid"
        className={cn(
          "grid gap-4",
          !setupComplete && "lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]",
        )}
      >
        <Card className="shadow-card" data-tour="workshop-overview-atenciones">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Clock3 className="size-4" aria-hidden="true" />
              </span>
              <div>
                <CardTitle className="font-semibold">
                  Atenciones recientes
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Últimos servicios registrados en el taller.
                </p>
              </div>
            </div>
            <Link
              href="/atenciones"
              className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              Ver todas
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent>
            {episodesQuery.isLoading ? (
              <RecentSkeleton />
            ) : episodesQuery.isError ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-sm text-destructive" role="alert">
                  No se pudieron cargar las atenciones.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void episodesQuery.refetch()}
                >
                  <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Reintentar
                </Button>
              </div>
            ) : episodes.length === 0 ? (
              <EmptyState
                icon={Wrench}
                title="Todavía no hay atenciones registradas"
                description="Cuando ingreses un vehículo o verifiques un servicio del propietario, vas a verlo acá."
                action={
                  <Link href="/atenciones/nueva">
                    <Button className="min-h-11 px-5">
                      Registrar servicio
                    </Button>
                  </Link>
                }
              />
            ) : (
              <CareEpisodeTable
                items={episodes}
                isFetching={episodesQuery.isFetching}
              />
            )}
          </CardContent>
          <div className="mx-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2.5">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
              <CircleHelp
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              ¿Necesitás ver el historial completo?
            </span>
            <Link
              href="/atenciones"
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              Ir al historial
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </div>
        </Card>

        {!setupComplete && (
          <div data-tour="workshop-overview-checklist">
            <WorkshopSetupChecklist
              workshop={workshop}
              careEpisodesCount={totalEpisodes ?? episodes.length}
              onNavigateSection={onNavigateSection}
            />
          </div>
        )}
      </div>
    </div>
  );
}
