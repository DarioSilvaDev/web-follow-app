"use client";

/**
 * Auto-servicio del taller — "Mi taller" (DECISION-REGISTER PROD-001).
 *
 * Ruta `/workshops/[id]`, fuente `GET /workshops/:id` (`workshopApi.getWorkshop`).
 * El endpoint exige membresía activa en el backend; acá solo se refleja el 403
 * como estado — la UI nunca es frontera de seguridad (AGENTS.md §20/§22).
 *
 * Alcance: pestañas **Datos**, **Sucursales** y **Especialidades**. La sección
 * Equipo sigue sin renderizarse (`workshop.roles.*` queda fuera de alcance).
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
  ClipboardCheck,
  FileText,
  Link2,
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
import { WorkshopCompletenessCard } from "@/components/workshop/workshop-completeness-card";
import { WorkshopProfileForm } from "@/components/workshop/workshop-profile-form";
import { WorkshopSpecialtiesSection } from "@/components/workshop/workshop-specialties-section";
import { workshopApi } from "@/lib/api";
import { resolveWorkshopDetailError } from "@/lib/workshop-errors";
import { typeScale } from "@/components/ui/type-scale";

export default function WorkshopDetailPage() {
  const params = useParams<{ id: string }>();
  const workshopId = params.id;
  const [tab, setTab] = useState("datos");

  const workshopQuery = useQuery({
    queryKey: ["workshop", workshopId],
    queryFn: () => workshopApi.getWorkshop(workshopId),
  });

  const workshop = workshopQuery.data;
  const status = (workshopQuery.error as { status?: number } | null)?.status;
  const isNotFound = status === 404;

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
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card border bg-muted text-muted-foreground">
                    <Store className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <h1
                      className={`font-heading font-semibold tracking-tight ${typeScale.display}`}
                    >
                      {workshop.name}
                    </h1>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                      {workshop.legalName && <span>{workshop.legalName}</span>}
                      {workshop.taxId && <span>· {workshop.taxId}</span>}
                      {!workshop.legalName && !workshop.taxId && (
                        <span>Sin razón social / CUIT cargados</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-1 text-xs">
                      <StatusBadge
                        status={workshop.isActive ? "active" : "inactive"}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href="/atenciones/nueva">
                    <Button className="min-h-11 px-5">
                      <Wrench className="mr-1.5" aria-hidden="true" />
                      Registrar servicio
                    </Button>
                  </Link>
                  <Link href="/atenciones">
                    <Button variant="outline" className="min-h-11">
                      <FileText className="mr-1.5" aria-hidden="true" />
                      Ver atenciones
                    </Button>
                  </Link>
                  <Link href="/atenciones/verificaciones">
                    <Button variant="outline" className="min-h-11">
                      <ClipboardCheck className="mr-1.5" aria-hidden="true" />
                      Verificaciones
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
              </div>
            </CardHeader>
          </Card>

          <WorkshopCompletenessCard
            workshop={workshop}
            onNavigate={(section) => setTab(section)}
          />

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="datos">Datos</TabsTrigger>
              <TabsTrigger value="sucursales">Sucursales</TabsTrigger>
              <TabsTrigger value="especialidades">Especialidades</TabsTrigger>
            </TabsList>
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
