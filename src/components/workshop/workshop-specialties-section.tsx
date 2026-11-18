"use client";

/**
 * Especialidades del taller — auto-servicio "Mi taller"
 * (DECISION-REGISTER PROD-003, FR-007).
 *
 * Por qué existe: `/atenciones/nueva` filtra el catálogo de tipos de atención
 * por las especialidades del taller (`GET /care-episodes/service-types`). Sin
 * especialidades el backend responde `onboardingRequired: true` y el check-in
 * avisa *"Cargalas en Mi taller para filtrar"* — hasta esta sección no había
 * ningún lugar de la app para hacerlo.
 *
 * Contratos (existentes en backend, NO inventados — `workshops.controller.ts`
 * y `public.controller.ts`):
 * - GET    /workshops/:id/specialties         → `WorkshopGuard` (membresía
 *   activa; cualquier miembro lee).
 * - POST   /workshops/:id/specialties {specialtyId} → alta,
 * - DELETE /workshops/:id/specialties/:specialtyId → baja; ambos con
 *   `workshop.specialties.manage` (seedeado al rol `owner`, verificado en
 *   `api-follow-app/prisma/seed.ts` + spec de consistencia del seed).
 * - GET    /specialties → catálogo público para el selector de alta. Ojo: el
 *   controller es `@Controller()` SIN prefijo `workshops`, la ruta real es
 *   `GET /api/specialties`.
 *
 * Permisos: gate de UX con `canInWorkshop` (`admin-access.ts`) sobre
 * `workshopMemberships[].role.permissions` — el permiso efectivo por
 * membresía SÍ está expuesto en `/auth/me`. No es frontera de seguridad: el
 * backend vuelve a validar, y un 403 real también se maneja acá (FR-004 /
 * PROD-003: ante falta de permiso se muestra texto de ayuda, **no** se oculta
 * la sección — el mecánico igual ve las especialidades).
 *
 * Patrón: espejo de `workshop-branches-section.tsx` — estado propio, banner
 * de éxito inline con `Callout`, errores mapeados por `workshop-errors.ts`
 * (nunca texto crudo del backend, FR-007). Sin toasts (convención del repo).
 *
 * Invalidación: además de `["workshop-specialties", workshopId]` se invalida
 * `["care-episode-service-types"]`: el catálogo del check-in se DERIVA de
 * estas filas y sin eso el aviso de onboarding seguiría visible hasta el
 * próximo refetch.
 *
 * Sobre el multiselect (plan-frontend.md:426): el selector abre con búsqueda
 * y permite marcar varias especialidades para añadir de una. La baja vive en
 * cada chip cargado (no dentro del selector de alta): mezclar "quitar" dentro
 * de un panel llamado "Añadir" confunde la intención, y la API es por
 * especialidad individual (POST/DELETE) igual en ambos casos.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, RefreshCw, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { workshopApi } from "@/lib/api";
import { canInWorkshop } from "@/lib/admin-access";
import { useAuth } from "@/hooks/use-auth";
import {
  resolveListSpecialtiesError,
  resolveSpecialtyError,
} from "@/lib/workshop-errors";
import type { WorkshopDetail, WorkshopSpecialty } from "@/types/workshop";

const MANAGE_PERMISSION = "workshop.specialties.manage";
const SUCCESS_FEEDBACK_MS = 4000;

interface WorkshopSpecialtiesSectionProps {
  workshop: WorkshopDetail;
}

export function WorkshopSpecialtiesSection({
  workshop,
}: WorkshopSpecialtiesSectionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  // FR-004 / PROD-003: el gate preventivo usa el permiso efectivo de la
  // membresía; el 403 real (rol custom sin permiso, sesión vieja) activa
  // este estado y la sección queda en modo lectura con el motivo.
  const [accessDenied, setAccessDenied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const specialtiesQuery = useQuery({
    queryKey: ["workshop-specialties", workshop.id],
    queryFn: () => workshopApi.listSpecialties(workshop.id),
  });

  const canManage =
    canInWorkshop(user, workshop.id, MANAGE_PERMISSION) && !accessDenied;

  // El catálogo solo se pide cuando hay permiso y el selector está abierto:
  // para leer lo ya cargado no aporta.
  const catalogQuery = useQuery({
    queryKey: ["specialty-catalog"],
    queryFn: () => workshopApi.listSpecialtyCatalog(),
    enabled: canManage && showPicker,
  });

  const specialties = specialtiesQuery.data ?? [];
  const loadedIds = new Set(specialties.map((specialty) => specialty.id));

  const searchValue = search.trim().toLowerCase();
  const available = (catalogQuery.data ?? []).filter(
    (specialty) => !loadedIds.has(specialty.id),
  );
  const filtered = searchValue
    ? available.filter(
        (specialty) =>
          specialty.name.toLowerCase().includes(searchValue) ||
          specialty.code.toLowerCase().includes(searchValue),
      )
    : available;

  const invalidateSpecialties = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["workshop-specialties", workshop.id],
    });
    // El catálogo de tipos de atención del check-in se deriva de las
    // especialidades: sin esto, el aviso "todavía no cargó especialidades"
    // persistiría en /atenciones/nueva hasta el próximo refetch.
    await queryClient.invalidateQueries({
      queryKey: ["care-episode-service-types"],
    });
  };

  const flashSuccess = (message: string) => {
    setSuccessBanner(message);
    window.setTimeout(() => setSuccessBanner(null), SUCCESS_FEEDBACK_MS);
  };

  const openPicker = () => {
    setActionError(null);
    setSearch("");
    setSelectedIds([]);
    setShowPicker(true);
  };

  const closePicker = () => {
    setShowPicker(false);
    setSearch("");
    setSelectedIds([]);
  };

  const toggleSelected = (specialtyId: string) =>
    setSelectedIds((previous) =>
      previous.includes(specialtyId)
        ? previous.filter((id) => id !== specialtyId)
        : [...previous, specialtyId],
    );

  const handleAdd = async () => {
    if (selectedIds.length === 0) return;
    setActionError(null);
    setIsSaving(true);
    const count = selectedIds.length;
    try {
      // La API es por especialidad individual: se sincroniza el alta de cada
      // una. Un fallo a mitad de lote deja las altas previas hechas, por eso
      // el catch también invalida (ver comentario abajo).
      for (const specialtyId of selectedIds) {
        await workshopApi.addSpecialty(workshop.id, specialtyId);
      }
      await invalidateSpecialties();
      closePicker();
      flashSuccess(
        count === 1
          ? "Se agregó la especialidad."
          : `Se agregaron ${count} especialidades.`,
      );
    } catch (error) {
      if ((error as { status?: number })?.status === 403) {
        setAccessDenied(true);
        closePicker();
      }
      // Algún alta puede haberse completado antes del fallo: refrescar igual
      // para que los chips no queden desincronizados con el backend.
      void invalidateSpecialties();
      setActionError(resolveSpecialtyError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (specialty: WorkshopSpecialty) => {
    setActionError(null);
    setPendingRemoveId(specialty.id);
    try {
      await workshopApi.removeSpecialty(workshop.id, specialty.id);
      await invalidateSpecialties();
      flashSuccess(`Se quitó ${specialty.name}.`);
    } catch (error) {
      if ((error as { status?: number })?.status === 403) {
        setAccessDenied(true);
      }
      void invalidateSpecialties();
      setActionError(resolveSpecialtyError(error));
    } finally {
      setPendingRemoveId(null);
    }
  };

  const isLoadingList = specialtiesQuery.isLoading;
  const listFailed = specialtiesQuery.isError;
  const showList = !isLoadingList && !listFailed;

  return (
    <div className="flex flex-col gap-5">
      {isLoadingList && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Cargando especialidades…
        </p>
      )}

      {listFailed && (
        <Callout variant="destructive" role="alert">
          <div className="flex flex-col items-start gap-2">
            <span>{resolveListSpecialtiesError(specialtiesQuery.error)}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => specialtiesQuery.refetch()}
            >
              <RefreshCw className="mr-1" aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        </Callout>
      )}

      {showList && specialties.length === 0 && (
        <EmptyState
          icon={Wrench}
          title="Todavía no cargaste especialidades"
          description="Sin especialidades, el check-in muestra todos los tipos de atención. Cargá las que trabaja tu taller para que el catálogo quede filtrado."
          action={
            canManage ? (
              <Button type="button" onClick={openPicker}>
                Agregar la primera especialidad
              </Button>
            ) : undefined
          }
        />
      )}

      {showList && specialties.length > 0 && (
        <ul
          aria-label="Especialidades cargadas"
          className="flex flex-wrap gap-2"
        >
          {specialties.map((specialty) => (
            <li key={specialty.id}>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-1 pl-3 pr-1.5 text-xs font-medium text-muted-foreground">
                {specialty.name}
                {canManage && (
                  <button
                    type="button"
                    aria-label={`Quitar ${specialty.name}`}
                    disabled={pendingRemoveId === specialty.id}
                    onClick={() => handleRemove(specialty)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {pendingRemoveId === specialty.id ? (
                      <Loader2
                        className="h-3 w-3 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <X className="h-3 w-3" aria-hidden="true" />
                    )}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {showList && specialties.length > 0 && canManage && !showPicker && (
        <div>
          <Button type="button" variant="outline" onClick={openPicker}>
            <Plus className="mr-1" aria-hidden="true" />
            Añadir especialidad
          </Button>
        </div>
      )}

      {showList && !canManage && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Necesitás permiso de administrador del taller para gestionar las
          especialidades.
        </p>
      )}

      {successBanner && <Callout variant="success">{successBanner}</Callout>}

      {actionError && (
        <Callout variant="destructive" role="alert">
          {actionError}
        </Callout>
      )}

      {canManage && showPicker && (
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Añadir especialidad</h3>
            <p className="text-xs text-muted-foreground">
              Elegí una o varias del catálogo.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="specialty-search">Buscar</Label>
            <Input
              id="specialty-search"
              type="search"
              placeholder="Buscar por nombre o código…"
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {catalogQuery.isLoading && (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Cargando catálogo…
            </p>
          )}

          {catalogQuery.isError && (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p className="text-sm text-muted-foreground">
                No pudimos cargar el catálogo de especialidades.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => catalogQuery.refetch()}
              >
                <RefreshCw className="mr-1" aria-hidden="true" />
                Reintentar
              </Button>
            </div>
          )}

          {catalogQuery.data !== undefined &&
            (filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {available.length === 0
                  ? "Ya cargaste todas las especialidades del catálogo."
                  : "No encontramos especialidades con esa búsqueda."}
              </p>
            ) : (
              <div
                role="group"
                aria-label="Especialidades disponibles"
                className="flex flex-wrap gap-2"
              >
                {filtered.map((specialty) => {
                  const active = selectedIds.includes(specialty.id);
                  return (
                    <button
                      key={specialty.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleSelected(specialty.id)}
                      className={
                        active
                          ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                          : "rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      }
                    >
                      {specialty.name}
                    </button>
                  );
                })}
              </div>
            ))}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={closePicker}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={selectedIds.length === 0 || isSaving}
              onClick={handleAdd}
            >
              {isSaving && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              {isSaving
                ? "Agregando…"
                : selectedIds.length > 0
                  ? `Añadir (${selectedIds.length})`
                  : "Añadir"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
