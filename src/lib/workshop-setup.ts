/**
 * Lógica pura del checklist "Primeros pasos del taller" (4 ítems).
 *
 * La completitud NO se persiste en localStorage: se deriva del estado real
 * del dominio (WorkshopDetail + queries de especialidades y atenciones).
 *
 * Decisiones de producto:
 * - "Completar datos del taller" exige email, teléfono, descripción, razón
 *   social y CUIT. El sitio web es OPCIONAL (hay talleres sin página propia).
 * - "Invitar al equipo" se difiere a otra etapa: no es parte de este checklist.
 */

import type { TourId } from "@/lib/onboarding/tour-registry";
import type { WorkshopDetail } from "@/types/workshop";

export type SetupSection = "datos" | "sucursales" | "especialidades";

export interface SetupItem {
  id: string;
  label: string;
  hint: string;
  complete: boolean;
  /** Tour que explica el paso (se dispara con "Ver guía"). */
  tourId: TourId;
  /** Acción directa cuando el tour ya se vio y el paso sigue pendiente. */
  actionLabel: string;
  /** Sección destino dentro de /workshops/[id], o ruta externa. */
  section?: SetupSection;
  href?: string;
}

export interface SetupSummary {
  items: SetupItem[];
  completed: number;
  total: number;
  percent: number;
  isComplete: boolean;
}

const nonEmpty = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

export function computeWorkshopSetup(
  workshop: WorkshopDetail,
  specialtiesCount: number,
  careEpisodesCount: number,
): SetupItem[] {
  const branches = workshop.branches ?? [];

  return [
    {
      id: "datos",
      label: "Completar datos del taller",
      hint: "Email, teléfono, descripción, razón social y CUIT.",
      complete:
        nonEmpty(workshop.email) &&
        nonEmpty(workshop.phone) &&
        nonEmpty(workshop.description) &&
        nonEmpty(workshop.legalName) &&
        nonEmpty(workshop.taxId),
      tourId: "profile",
      actionLabel: "Completar",
      section: "datos",
    },
    {
      id: "sucursal",
      label: "Crear una sucursal",
      hint: "Necesitás al menos una para registrar atenciones.",
      complete: branches.length > 0,
      tourId: "branch",
      actionLabel: "Crear",
      section: "sucursales",
    },
    {
      id: "especialidades",
      label: "Cargar especialidades",
      hint: "Tus clientes ven qué servicios ofrecés.",
      complete: specialtiesCount > 0,
      tourId: "specialty",
      actionLabel: "Configurar",
      section: "especialidades",
    },
    {
      id: "atencion",
      label: "Registrar la primera atención",
      hint: "Buscá el vehículo por patente y completá el ingreso.",
      complete: careEpisodesCount > 0,
      tourId: "careEpisode",
      actionLabel: "Registrar",
      href: "/atenciones/nueva",
    },
  ];
}

export function summarizeSetup(items: SetupItem[]): SetupSummary {
  const total = items.length;
  const completed = items.filter((item) => item.complete).length;
  return {
    items,
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    isComplete: total > 0 && completed === total,
  };
}

export function getWorkshopSetup(
  workshop: WorkshopDetail,
  specialtiesCount: number,
  careEpisodesCount: number,
): SetupSummary {
  return summarizeSetup(
    computeWorkshopSetup(workshop, specialtiesCount, careEpisodesCount),
  );
}
