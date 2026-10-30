"use client";

/**
 * Auto-servicio del taller — "Mi taller" (DECISION-REGISTER PROD-001).
 *
 * Ruta `/workshops/[id]`, fuente `GET /workshops/:id` (`workshopApi.getWorkshop`).
 * El endpoint exige membresía activa en el backend; acá solo se refleja el 403
 * como estado — la UI nunca es frontera de seguridad (AGENTS.md §20/§22).
 *
 * Alcance de esta iteración: pestañas **Datos** y **Sucursales**. Las secciones
 * Equipo y Especialidades NO se renderizan: sus permisos (`workshop.roles.*`,
 * `workshop.specialties.manage`) están declarados en el backend pero ausentes
 * del seed, por lo que darían 403 garantizado (ver `BE-001`).
 *
 * Espejo de `/dealerships/[id]`, que ya establece el patrón del repo.
 */

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkshopBranchesSection } from "@/components/workshop/workshop-branches-section";
import { WorkshopCompletenessCard } from "@/components/workshop/workshop-completeness-card";
import { WorkshopProfileForm } from "@/components/workshop/workshop-profile-form";
import { workshopApi } from "@/lib/api";
import { resolveWorkshopDetailError } from "@/lib/workshop-errors";

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
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
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
                  <Store className="h-5 w-5" />
                </div>
                <div className="flex flex-col gap-1">
                  <h1 className="text-2xl font-bold tracking-tight">
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
                    <Badge variant={workshop.isActive ? "success" : "secondary"}>
                      {workshop.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
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
          </Tabs>
        </>
      )}
    </div>
  );
}