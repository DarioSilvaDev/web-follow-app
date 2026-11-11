"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Link2, Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/admin-access";
import { vehicleClaimApi } from "@/lib/api";
import { CLAIM_PANEL_NO_PERMISSION } from "@/lib/vehicle-claim-errors";
import type {
  VehicleClaimStatus,
  WorkshopClaimListItem,
} from "@/types/vehicle-claim";

// ---------------------------------------------------------------------------
// F-2 — "Reclamos" (listado del taller, contexto WORKSHOP).
//
// Journey de lectura: quick action "Reclamos" del dashboard → listado de los
// invites de reclamo del taller del contexto → detalle del vehículo
// (/vehicles/{vehicleId}).
//
// Comparte la query key `["vehicle-claims","list",workshopId]` con el panel
// de la atención (page=1&limit=100): una sola cache para el listado, con
// invalidación conjunta. El backend NO expone filtro por vehículo ni
// paginación por status en el panel (gap reportado) — acá el paginado y los
// filtros por chip son CLIENTES sobre esos 100 items.
//
// Sin spec de copy para esta página (el spec §2 cubre sólo el panel): loading,
// empty y error usan copy derivado (flag en el reporte). Permisos UX:
// `vehicle-claim.list` (la autoridad es el backend).
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

/** Chips del filtro (label literal del copy §2) + estados que agrupan. */
const CHIPS: { id: string; label: string; statuses: VehicleClaimStatus[] }[] =
  [
    { id: "vigente", label: "Vigente", statuses: ["pending", "verification_required", "verified"] },
    { id: "review", label: "A revisar", statuses: ["manual_review"] },
    { id: "claimed", label: "Reclamado", statuses: ["claimed"] },
    { id: "blocked", label: "Bloqueado", statuses: ["claim_blocked"] },
    { id: "expired", label: "Vencido", statuses: ["expired"] },
    { id: "revoked", label: "Revocado", statuses: ["revoked"] },
  ];

/** Badge por estado (variantes derivadas — flag en el reporte). */
const STATUS_BADGES: Record<
  VehicleClaimStatus,
  { label: string; variant: BadgeVariant }
> = {
  pending: { label: "Vigente", variant: "success" },
  verification_required: { label: "Vigente", variant: "success" },
  verified: { label: "Vigente", variant: "success" },
  manual_review: { label: "A revisar", variant: "warning" },
  claimed: { label: "Reclamado", variant: "info" },
  claim_blocked: { label: "Bloqueado", variant: "destructive" },
  expired: { label: "Vencido", variant: "secondary" },
  revoked: { label: "Revocado", variant: "secondary" },
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ReclamosPage() {
  const activeContext = useActiveContext();
  const workshopId =
    activeContext?.type === "WORKSHOP" ? activeContext.workshopId : null;
  const { status, user } = useAuth();
  const router = useRouter();

  const workshopName = user?.workshopMemberships.find(
    (membership) => membership.workshopId === workshopId,
  )?.workshop.name;

  const hasWorkshopMembership = (user?.workshopMemberships?.length ?? 0) > 0;

  // Guard de membresía (PO): sin taller no hay journey de reclamos →
  // redirect a /dashboard (mismo patrón que atenciones; UX únicamente).
  useEffect(() => {
    if (status !== "loading" && !hasWorkshopMembership) {
      router.replace("/dashboard");
    }
  }, [status, hasWorkshopMembership, router]);

  const canList = can(user, "vehicle-claim.list");

  const [chip, setChip] = useState<string>("all");
  const [page, setPage] = useState(1);

  // NOTA: no hay effect de reset al cambiar de taller — sería
  // `react-hooks/set-state-in-effect` (regla que ya falla en la base
  // existente). Acá el paginado es CLIENTE y `safePage` se recorta contra
  // `totalPages`, y el chip aplica a todos los talleres, así que el estado
  // sigue siendo válido al cambiar de contexto. Sólo se resetea al elegir
  // un chip (event handler).

  // MISMA key y MISMA query que el panel de la atención (cache compartida).
  const listQuery = useQuery({
    queryKey: ["vehicle-claims", "list", workshopId],
    queryFn: () => vehicleClaimApi.listClaims({ page: 1, limit: 100 }),
    enabled: canList && workshopId !== null,
    retry: false,
  });

  const allItems = useMemo(
    () => listQuery.data?.data ?? [],
    [listQuery.data],
  );
  const counts = listQuery.data?.meta?.counts;

  const filtered = useMemo(() => {
    if (chip === "all") return allItems;
    const statuses = CHIPS.find((c) => c.id === chip)?.statuses ?? [];
    return allItems.filter((item) => statuses.includes(item.status));
  }, [allItems, chip]);

  // Paginación CLIENTE sobre el máximo 100 items (gap: no hay server paging
  // por filtro — ver comentario del módulo).
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  // Sin taller seleccionado: WORKSHOP-only (mismo texto que atenciones).
  if (workshopId === null) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Heading />
        <Card>
          <CardContent>
            <p role="status" className="text-sm text-muted-foreground">
              Para ver los reclamos de tu taller necesitás operar en el
              contexto de un taller.{" "}
              {hasWorkshopMembership
                ? "Entrá a la sección Talleres del menú y elegí tu taller para activar su contexto."
                : "Todavía no formás parte de un taller. Pedí una invitación por email para sumarte al equipo de uno."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sin permiso: sin request (§2.14).
  if (!canList) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Heading workshopName={workshopName} />
        <Card>
          <CardContent>
            <Callout variant="info" role="status">
              {CLAIM_PANEL_NO_PERMISSION}
            </Callout>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Heading workshopName={workshopName} />

      {listQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground" role="status">
              Cargando reclamos…
            </p>
          </CardContent>
        </Card>
      ) : listQuery.isError ? (
        <Card>
          <CardContent className="grid gap-3 py-6 text-center">
            <Callout variant="destructive" role="alert">
              No pudimos cargar los reclamos. Intentá de nuevo.
            </Callout>
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void listQuery.refetch()}
              >
                <RotateCw className="h-3.5 w-3.5" />
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : allItems.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Link2}
              title="Todavía no hay reclamos"
              description="Cuando generes un link de reclamo desde una atención, vas a verlo acá."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Filtros por chip (counts del meta, pre-filtro en backend) ── */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar reclamos por estado">
            <button
              type="button"
              aria-pressed={chip === "all"}
              onClick={() => {
                setChip("all");
                setPage(1);
              }}
              className={
                chip === "all"
                  ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  : "rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              Todos{counts ? ` (${allItems.length})` : ""}
            </button>
            {CHIPS.map((c) => {
              const count = counts
                ? c.statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0)
                : null;
              const active = chip === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setChip(c.id);
                    setPage(1);
                  }}
                  className={
                    active
                      ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                      : "rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {c.label}
                  {count !== null ? ` (${count})` : ""}
                </button>
              );
            })}
          </div>

          {pageItems.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={Link2}
                  title="No hay reclamos en este estado"
                  description="Probá con otro filtro para ver el resto de los reclamos."
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <ul
                className="flex flex-col gap-4"
                aria-busy={listQuery.isFetching}
              >
                {pageItems.map((item: WorkshopClaimListItem) => {
                  const badge = STATUS_BADGES[item.status];
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/vehicles/${item.vehicleId}`}
                        className="block rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Card className="transition-colors hover:bg-muted/40 hover:ring-primary/40">
                          <CardContent className="grid gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold">
                                {item.licensePlate}
                              </p>
                              <Badge variant={badge.variant}>
                                {badge.label}
                              </Badge>
                            </div>
                            <div className="grid gap-1 text-sm">
                              <p className="text-muted-foreground">
                                Creado el {formatDate(item.createdAt)}
                                {item.failedAttempts > 0
                                  ? ` · ${item.failedAttempts} intento${item.failedAttempts === 1 ? "" : "s"} fallido${item.failedAttempts === 1 ? "" : "s"}`
                                  : ""}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Vence el {formatDate(item.expiresAt)}.
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {totalPages > 1 && (
                <Card className="py-0">
                  <AdminTablePagination
                    page={safePage}
                    totalPages={totalPages}
                    total={filtered.length}
                    isFetching={listQuery.isFetching}
                    onPageChange={setPage}
                  />
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Heading({ workshopName }: { workshopName?: string }) {
  return (
    <div>
      <Link
        href="/dashboard"
        className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Volver al inicio
      </Link>
      <div className="mt-3">
        <h1 className="text-2xl font-bold tracking-tight">Reclamos</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Links de reclamo de {workshopName ?? "tu taller"}
      </p>
    </div>
  );
}
