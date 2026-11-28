"use client";

/**
 * Auto-servicio del taller — "Mi taller" (DECISION-REGISTER PROD-001).
 *
 * Ruta `/workshops/[id]`, fuente `GET /workshops/:id` (`workshopApi.getWorkshop`).
 * El endpoint exige membresía activa en el backend; acá solo se refleja el 403
 * como estado — la UI nunca es frontera de seguridad (AGENTS.md §20/§22).
 *
 * Alcance: pestañas **Resumen**, **Datos**, **Sucursales** y **Especialidades**.
 * El default es **Resumen** (tablero operativo: atenciones recientes, cola de
 * verificaciones y checklist de completitud) porque un miembro entra a prestar
 * servicio, no a editar su ficha. La sección Equipo sigue sin renderizarse
 * (`workshop.roles.*` queda fuera de alcance).
 * `workshop.specialties.manage` SÍ existe hoy en el seed (BE-001 resuelto para
 * este código — verificado en `api-follow-app/prisma/seed.ts` y su spec de
 * consistencia), por lo que la pestaña Especialidades se habilita con el gate
 * de UX `canInWorkshop` y reacciona igual al 403 real (PROD-003 / FR-004).
 *
 * El header también expone los CTAs de atenciones (`/atenciones/nueva`,
 * `/atenciones`, `/atenciones/verificaciones` y `/reclamos`): sin ellos la
 * página era un callejón sin salida hacia la operación diaria del taller
 * (F-023: las atenciones no son items de nav; F-2: reclamos tampoco). El
 * hook de ruta fija el contexto WORKSHOP a este taller, así `/reclamos`
 * lista los reclamos del taller mostrado acá.
 *
 * Espejo de `/dealerships/[id]`, que ya establece el patrón del repo.
 */

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ClipboardCheck,
  FileText,
  Link2,
  MoreVertical,
  RefreshCw,
  Store,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkshopBranchesSection } from "@/components/workshop/workshop-branches-section";
import { WorkshopOverviewSection } from "@/components/workshop/workshop-overview-section";
import { WorkshopProfileForm } from "@/components/workshop/workshop-profile-form";
import { WorkshopSpecialtiesSection } from "@/components/workshop/workshop-specialties-section";
import { workshopApi, careEpisodeApi } from "@/lib/api";
import { resolveWorkshopDetailError } from "@/lib/workshop-errors";
import { cn } from "cn";
import { typeScale } from "@/components/ui/type-scale";

export default function WorkshopDetailPage() {
  const params = useParams<{ id: string }>();
  const workshopId = params.id;
  // Default operativo: el miembro cae en el tablero del taller, no en el
  // formulario de configuración.
  const [tab, setTab] = useState("resumen");
  const [menuOpen, setMenuOpen] = useState(false);

  const workshopQuery = useQuery({
    queryKey: ["workshop", workshopId],
    queryFn: () => workshopApi.getWorkshop(workshopId),
  });

  const workshop = workshopQuery.data;
  const branchesCount =
    workshop?.branches?.length ?? workshop?.branchCount ?? 0;
  const status = (workshopQuery.error as { status?: number } | null)?.status;
  const isNotFound = status === 404;

  // Mismo queryKey que usa WorkshopOverviewSection → React Query deduce y no
  // hay doble fetch. Sirve para el indicador de verificaciones pendientes.
  const verificationsQuery = useQuery({
    queryKey: ["workshop-overview-verifications", workshopId],
    queryFn: () => careEpisodeApi.getCareEpisodeVerifications(),
    retry: false,
    enabled: Boolean(workshop),
  });
  const pendingVerifications = verificationsQuery.data?.length;

  // Especialidades cargadas del taller → se usa para mostrar el indicador de
  // "pendientes de configurar" SOLO cuando el taller no tiene ninguna.
  // Mismo queryKey que usa WorkshopSpecialtiesSection → React Query deduce y
  // no hay doble fetch.
  const specialtiesQuery = useQuery({
    queryKey: ["workshop-specialties", workshopId],
    queryFn: () => workshopApi.listSpecialties(workshopId),
    enabled: Boolean(workshop),
  });
  const specialties = specialtiesQuery.data ?? [];
  const hasSpecialties = specialties.length > 0;
  const showSpecialtiesPending =
    !specialtiesQuery.isLoading &&
    !specialtiesQuery.isError &&
    !hasSpecialties;

  // Barra de tabs con subrayado azul en el activo (según diseño validado).
  // El wrapper por defecto usa píldora con fondo; acá lo llevamos a barra.
  const tabTriggerClass =
    "rounded-none border-b-2 border-transparent px-2 py-2 text-xs font-medium text-muted-foreground sm:px-3 sm:text-sm data-[active]:border-primary data-[active]:bg-transparent data-[active]:text-primary data-[active]:shadow-none";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4">
      {workshopQuery.isLoading && (
        <Card>
          <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            Cargando taller…
          </CardContent>
        </Card>
      )}

      {isNotFound && (
        <EmptyState
          icon={Store}
          title="Taller no encontrado"
          description="No existe o fue eliminado."
        />
      )}

      {status === 403 && (
        <EmptyState
          icon={Store}
          title="No tenés acceso a este taller"
          description="Tu membresía no está activa o fue dada de baja."
        />
      )}

      {!isNotFound && status !== 403 && workshopQuery.isError && (
        <EmptyState
          icon={Store}
          title="No se pudo cargar la información del taller"
          description={resolveWorkshopDetailError(workshopQuery.error)}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => workshopQuery.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
          }
        />
      )}

      {workshop && (
        <>
          {/* overflow-visible: el menú secundario mobile se posiciona con
              `absolute top-full` dentro del header; con el `overflow-hidden`
              default de Card se recortaba y las opciones no se veían. */}
          <Card className="overflow-visible">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-card bg-primary/10 text-primary">
                    <Store className="size-5" aria-hidden="true" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1
                        className={`font-serif font-semibold tracking-tight ${typeScale.display}`}
                      >
                        {workshop.name}
                      </h1>
                      <StatusBadge
                        status={workshop.isActive ? "active" : "inactive"}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {workshop.taxId && <span>CUIT {workshop.taxId}</span>}
                      {workshop.legalName && <span>{workshop.legalName}</span>}
                      <span aria-hidden="true">•</span>
                      <span>
                        {branchesCount}{" "}
                        {branchesCount === 1 ? "sucursal" : "sucursales"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Desktop: los 4 CTAs en línea */}
                  <div className="hidden lg:flex lg:items-center gap-2">
                    <Link
                      href="/atenciones/nueva"
                      data-tour="workshop-cta-registrar"
                    >
                      <Button className="min-h-11 px-5">
                        <Wrench className="mr-1.5" aria-hidden="true" />
                        Registrar servicio
                        <ChevronDown
                          className="ml-1.5 size-3.5"
                          aria-hidden="true"
                        />
                      </Button>
                    </Link>
                    <Link href="/atenciones">
                      <Button variant="outline" className="min-h-11">
                        <FileText className="mr-1.5" aria-hidden="true" />
                        Ver atenciones
                      </Button>
                    </Link>
                    <Link href="/atenciones/verificaciones">
                      <Button variant="outline" className="min-h-11 relative">
                        <ClipboardCheck className="mr-1.5" aria-hidden="true" />
                        Verificaciones
                        {pendingVerifications !== undefined &&
                          pendingVerifications > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                              {pendingVerifications}
                            </span>
                          )}
                      </Button>
                    </Link>
                    {/* F-2: mismo patrón que los CTAs de atenciones — sin gate
                        en el botón; `/reclamos` maneja su propio permiso
                        (`vehicle-claim.list`). */}
                    <Link href="/reclamos">
                      <Button variant="outline" className="min-h-11">
                        <Link2 className="mr-1.5" aria-hidden="true" />
                        Reclamos
                      </Button>
                    </Link>
                  </div>

                  {/* Mobile: un solo botón principal + menú secundario desplegable */}
                  <div className="relative flex items-center gap-2 lg:hidden">
                    <Link
                      href="/atenciones/nueva"
                      data-tour="workshop-cta-registrar"
                    >
                      <Button className="min-h-11 px-5">
                        <Wrench className="mr-1.5" aria-hidden="true" />
                        Registrar servicio
                        <ChevronDown
                          className="ml-1.5 size-3.5"
                          aria-hidden="true"
                        />
                      </Button>
                    </Link>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setMenuOpen((o) => !o)}
                      aria-label="Más acciones"
                      aria-expanded={menuOpen}
                    >
                      <MoreVertical className="h-5 w-5" aria-hidden="true" />
                    </Button>
                    {menuOpen && (
                      <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-border bg-background shadow-lg">
                        <Link
                          href="/atenciones"
                          className="block px-4 py-2 text-sm text-foreground hover:bg-muted"
                          onClick={() => setMenuOpen(false)}
                        >
                          <FileText
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                          />
                          Ver atenciones
                        </Link>
                        <Link
                          href="/atenciones/verificaciones"
                          className="block px-4 py-2 text-sm text-foreground hover:bg-muted"
                          onClick={() => setMenuOpen(false)}
                        >
                          <ClipboardCheck
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                          />
                          Verificaciones
                          {pendingVerifications !== undefined &&
                            pendingVerifications > 0 && (
                              <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                                {pendingVerifications}
                              </span>
                            )}
                        </Link>
                        <Link
                          href="/reclamos"
                          className="block px-4 py-2 text-sm text-foreground hover:bg-muted"
                          onClick={() => setMenuOpen(false)}
                        >
                          <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                          Reclamos
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-0.5 rounded-none border-b border-border bg-transparent p-0 sm:gap-1">
              <TabsTrigger value="resumen" className={tabTriggerClass}>
                Resumen
              </TabsTrigger>
              <TabsTrigger value="datos" data-tour="workshop-tab-datos" className={tabTriggerClass}>
                Datos
              </TabsTrigger>
              <TabsTrigger value="sucursales" data-tour="workshop-tab-sucursales" className={tabTriggerClass}>
                Sucursales
              </TabsTrigger>
              <TabsTrigger
                value="especialidades"
                data-tour="workshop-tab-especialidades"
                className={cn(tabTriggerClass, "group relative gap-1.5")}
                aria-describedby="workshop-especialidades-pendientes"
              >
                Especialidades
                {showSpecialtiesPending && (
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-warning"
                  />
                )}
                {/* Tooltip accesible: hover y focus de teclado, sin dependencias.
                    El texto visible es decorativo; la descripción para lectores
                    de pantalla vive en el nodo sr-only referenciado arriba. */}
                {showSpecialtiesPending && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max max-w-56 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs font-normal text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    Tenés especialidades pendientes de configurar
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            {/* Descripción para lectores de pantalla: fuera del tablist para no
                romper la estructura ARIA (el tablist sigue teniendo solo tabs). */}
            {showSpecialtiesPending && (
              <span
                id="workshop-especialidades-pendientes"
                role="tooltip"
                className="sr-only"
              >
                Tenés especialidades pendientes de configurar
              </span>
            )}
            <TabsContent value="resumen" className="pt-3">
              <WorkshopOverviewSection
                workshop={workshop}
                onNavigateSection={setTab}
              />
            </TabsContent>
            <TabsContent value="datos" className="pt-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Datos del taller</CardTitle>
                </CardHeader>
                <CardContent>
                  <WorkshopProfileForm workshop={workshop} />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="sucursales" className="pt-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sucursales</CardTitle>
                </CardHeader>
                <CardContent>
                  <WorkshopBranchesSection workshop={workshop} />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="especialidades" className="pt-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Especialidades</CardTitle>
                </CardHeader>
                <CardContent>
                  <WorkshopSpecialtiesSection workshop={workshop} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
