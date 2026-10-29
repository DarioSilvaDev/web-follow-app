"use client";

/**
 * Listado de talleres — `/workshops` (espejo de `/dealerships`, D-105).
 *
 * Fuente: `GET /workshops` (`workshopApi.listMine`) — talleres donde el
 * usuario tiene membresía activa (403 sin membresía; super_admin ve todos —
 * enforcement en backend). La pertenencia/rol por taller se resuelve desde
 * la sesión (`SessionUser.workshopMemberships`), igual que en concesionarias.
 *
 * Sin botón de alta: NO existe endpoint self-service de creación de talleres
 * (la alta es por invitación/claim — D-106/D-109). No se inventan endpoints.
 *
 * Entrar a `/workshops/[id]` activa el contexto WORKSHOP (hook de ruta).
 */

import Link from "next/link";
import { RotateCw, Wrench } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { workshopApi } from "@/lib/api";

export default function WorkshopsPage() {
  const mineQuery = useQuery({
    queryKey: ["workshops-mine"],
    queryFn: () => workshopApi.listMine(),
  });

  const workshops = mineQuery.data?.data ?? [];
  const errorStatus = (mineQuery.error as { status?: number } | null)?.status;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Talleres</h1>
        <p className="text-sm text-muted-foreground">
          Talleres donde participás como miembro.
        </p>
      </div>

      {mineQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border bg-muted/50"
            />
          ))}
        </div>
      ) : errorStatus === 403 ? (
        // Deep-link posible sin membresía activa (el nav ya la condiciona):
        // se refleja el 403 como estado — la UI nunca es frontera de seguridad.
        <EmptyState
          icon={Wrench}
          title="No tenés acceso a los talleres"
          description="Tu membresía no está activa o fue dada de baja. Si esperás formar parte de un taller, pedí una invitación a su dueño o admin."
        />
      ) : mineQuery.isError ? (
        <EmptyState
          icon={Wrench}
          title="No se pudieron cargar tus talleres"
          description="Ocurrió un error inesperado. Intentá nuevamente."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void mineQuery.refetch()}
            >
              <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              Reintentar
            </Button>
          }
        />
      ) : workshops.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Todavía no formás parte de ningún taller"
          description="Sumate como miembro de un taller aceptando una invitación por email para verlo acá."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workshops.map((workshop) => (
            <Link
              key={workshop.id}
              href={`/workshops/${workshop.id}`}
              className="transition-colors hover:opacity-80"
            >
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">{workshop.name}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {[workshop.legalName, workshop.taxId]
                      .filter(Boolean)
                      .join(" · ") || "Sin razón social / CUIT cargados"}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
