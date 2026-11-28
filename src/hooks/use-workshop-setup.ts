"use client";

/**
 * Completitud del checklist "Primeros pasos del taller" derivada del estado
 * real del dominio (sin localStorage). La usa el propio checklist para pintar
 * sus ítems y el resumen del taller para decidir si reserva la columna.
 *
 * React Query deduplica la consulta por queryKey: varios consumidores
 * comparten una sola request de especialidades.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { workshopApi } from "@/lib/api";
import { getWorkshopSetup, type SetupSummary } from "@/lib/workshop-setup";
import type { WorkshopDetail } from "@/types/workshop";

export function useWorkshopSetupSummary(
  workshop: WorkshopDetail,
  careEpisodesCount: number,
): SetupSummary {
  const specialtiesQuery = useQuery({
    queryKey: ["workshop-specialties", workshop.id],
    queryFn: () => workshopApi.listSpecialties(workshop.id),
    retry: false,
  });
  const specialtiesCount = specialtiesQuery.data?.length ?? 0;

  return useMemo(
    () => getWorkshopSetup(workshop, specialtiesCount, careEpisodesCount),
    [workshop, specialtiesCount, careEpisodesCount],
  );
}
