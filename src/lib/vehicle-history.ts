/**
 * F-014 / D-052 + iteración 2-3 (D-069..D-071) — Vehicle timeline merge.
 *
 * Pure merge of the four history sources returned by
 * `GET /api/vehicles/:id/history` (`{ transfers, mileages, ownerships,
 * careEpisodes }`) into a single chronological list (newest first).
 * Rendering-agnostic: the detail page maps the `TimelineEntry[]` into the
 * "Historial" card.
 *
 * Timestamps (D-052 / D-070):
 * - transfers  → `createdAt`
 * - mileages   → `recordedAt`
 * - ownerships → `startsAt`
 * - cares      → `serviceDate ?? checkedInAt ?? createdAt`
 */
import type { VehicleCareEpisode, VehicleHistoryResponse } from "@/types/vehicle";
import { toDateOnly } from "@/lib/format-date";

export type TimelineEntryType = "transfer" | "mileage" | "ownership" | "care";

/** Una entrada de la línea de tiempo del vehículo (D-052/RF-2). */
export interface TimelineEntry {
  /** id de la fuente (prefijada para keys únicas de React). */
  id: string;
  /** Timestamp ISO usado para ordenar (createdAt/recordedAt/startsAt/D-070). */
  date: string;
  /**
   * Plan 05 / F-TZ-6: semántica de `date`. Decide **zona horaria** de render
   * (no si se muestra la hora): `date` → fecha calendario en UTC;
   * `instant` → hora local con el criterio de presentación de cada superficie.
   *
   * - `date`: `serviceDate` era una fecha calendario válida (`YYYY-MM-DD` o
   *   medianoche UTC). `dateOnly` trae el día normalizado.
   * - `instant`: cualquier otro caso (incluye `serviceDate` anómalo, p. ej.
   *   `…T09:00:00Z`, que **nunca** se trunca). `dateOnly` es `null`.
   *
   * `date` NO cambia: sigue siendo el ISO de orden D-070 y el `dateTime` del
   * `<time>`.
   */
  dateKind: "date" | "instant";
  /** `YYYY-MM-DD` cuando `dateKind === "date"`; `null` en instantes. */
  dateOnly: string | null;
  type: TimelineEntryType;
  title: string;
  /** Texto secundario (actor / fuente / nombres), cuando aplica. */
  actor?: string;
  /**
   * Leyenda de estado del episodio (D-071). Iteración 2-3: "Pendiente de
   * verificación" para owner sin verificar; "Rechazado por {taller}" para
   * `verification === "rejected"` (fallback "Rechazado por el taller
   * responsable"). El texto "Verificado por {taller}" NUNCA vive acá: es el
   * `actor` del episodio owner verificado y su gate exclusivo es
   * `verification === "verified"` (TL §3.3 — nunca por presencia de
   * `workshop`).
   */
  badge?: string;
  /** Notas de la fuente, si existen. */
  notes?: string;
  /**
   * Iteración 2-4: id del CareEpisode (SIN prefijo `care:`) para entradas de
   * tipo `care`. Habilitado → la entrada renderiza un deep-link al detalle
   * (`/vehicles/:vehicleId/servicios/:careId`). NO tocar `id` (prefijo
   * `care:{uuid}` — keys de React / tests D-070/D-071).
   */
  careId?: string;
}

const TRANSFER_STATUS_LABELS: Record<string, string> = {
  pending: "pendiente",
  accepted: "aceptada",
  rejected: "rechazada",
  cancelled: "cancelada",
  completed: "completada",
  expired: "expirada",
};

const MILEAGE_SOURCE_LABELS: Record<string, string> = {
  owner: "Propietario",
  workshop: "Taller",
  inspection: "Inspección",
  dealership: "Concesionaria",
  imported: "Importado",
  system: "Sistema",
};

/** Label español para `MileageSource` (misma convención que MileageSection). */
export function mileageSourceLabel(source?: string | null): string {
  if (!source) return "—";
  return MILEAGE_SOURCE_LABELS[source] ?? source;
}

/**
 * Lectura de odómetro más reciente declarada en una atención (D-070), para
 * mostrar un "Kilometraje actual" honesto cuando el vehículo NO tiene ningún
 * `VehicleMileage` (p. ej. registrado por el taller en el check-in).
 *
 * Reglas (PM E, 2026-11):
 * - Episodios `cancelled` se ignoran (no hubo atención real, D-024 A1/3).
 * - Se prefiere `mileageOut` (salida, más reciente) sobre `mileageIn`.
 * - Odómetro ilegible (`mileageInUnreadable`) o sin lecturas → `null`
 *   (el caller conserva el estado "no registrado"; nunca se inventa un km).
 * - `episodes` viene ordenado por el historial (D-070): el primero gana.
 * - El resultado SIEMPRE es "dato declarado sin verificar": quien lo muestre
 *   DEBE etiquetarlo con su procedencia. Nunca alcanza para un
 *   `VehicleMileage` sin acto explícito del titular.
 */
export interface EpisodeMileageReading {
  mileage: number;
  /** "ingreso" | "salida" — qué lectura fue (preferencia por `mileageOut`). */
  phase: "ingreso" | "salida";
  /** Quién lo declaró: taller (snapshot/relación) o propietario. */
  registrant: string | null;
  /** Fecha canónica del episodio (`serviceDate ?? checkedInAt ?? createdAt`). */
  at: string | null;
  source: "owner" | "workshop";
}

export function latestEpisodeMileage(
  episodes?: VehicleCareEpisode[],
): EpisodeMileageReading | null {
  if (!episodes) return null;
  for (const episode of episodes) {
    if (episode.status === "cancelled") continue;
    const mileage = episode.mileageOut ?? episode.mileageIn;
    if (mileage === null || mileage === undefined) continue;
    const workshopName = episode.workshopName ?? episode.workshop?.name ?? null;
    return {
      mileage,
      phase: episode.mileageOut != null ? "salida" : "ingreso",
      registrant:
        episode.source === "workshop" && workshopName
          ? `el taller ${workshopName}`
          : episode.source === "owner"
            ? "el propietario"
            : (workshopName ?? null),
      at: episode.serviceDate ?? episode.checkedInAt ?? episode.createdAt ?? null,
      source: episode.source,
    };
  }
  return null;
}

function userName(user?: { firstName: string; lastName: string }): string {
  if (!user) return "";
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
}

/**
 * D-052 + D-069..D-071: mergea las 4 fuentes en una lista cronológica desc.
 *
 * - Transfers: date = createdAt, título "Transferencia {estado}" (D-054).
 * - Mileages:  date = recordedAt, título "{km} km registrado", actor = source.
 * - Ownerships: date = startsAt; el más antiguo es "Inicio de propiedad",
 *   los siguientes "Propiedad transferida a {user}" (D-055).
 * - Cares (2-3): date = `serviceDate ?? checkedInAt ?? createdAt` (D-070);
 *   título `title ?? fallback por source` (D-071); actor según source y
 *   verification; sufijo "(cancelada)" si `status === "cancelled"`;
 *   badge "Pendiente de verificación" solo owner unverified; badge
 *   "Rechazado por {taller}" (fallback "Rechazado por el taller responsable")
 *   para `verification === "rejected"` con el ACTOR intacto — "Registrado por
 *   el propietario" (D-063: el origen no cambia). El actor "Verificado por
 *   {taller}" es EXCLUSIVO de `verification === "verified"`.
 *
 * Desempate: por timestamp; no hay regla estricta para empates exactos
 * (ver RF-1). El sort es estable — los empates conservan el orden de
 * inserción (transfers → mileages → ownerships → cares).
 */
export function mergeHistory(history: VehicleHistoryResponse): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const transfer of history.transfers) {
    entries.push({
      id: `transfer:${transfer.id}`,
      date: transfer.createdAt,
      dateKind: "instant",
      dateOnly: null,
      type: "transfer",
      title: `Transferencia ${
        TRANSFER_STATUS_LABELS[transfer.status] ?? transfer.status
      }`,
      actor: `De ${userName(transfer.fromUser)} a ${userName(transfer.toUser)}`,
      notes: transfer.notes ?? undefined,
    });
  }

  for (const mileage of history.mileages) {
    entries.push({
      id: `mileage:${mileage.id}`,
      date: mileage.recordedAt,
      dateKind: "instant",
      dateOnly: null,
      type: "mileage",
      title: `${mileage.mileage.toLocaleString("es-AR")} km registrado`,
      actor: mileageSourceLabel(mileage.source),
      notes: mileage.notes ?? undefined,
    });
  }

  // Ownerships: el primero cronológicamente es "Inicio de propiedad"; el
  // resto son transferencias de titularidad (D-055). El backend llega desc;
  // ordenamos asc solo para decidir el título y volvemos al merge global desc.
  // Milestone consignación (D-107): un ownership de concesionaria (type
  // company + dealership) se muestra como titular intermedio en la cadena
  // `Propietario → Concesionaria → Comprador`, sin PII de empleados.
  const ownershipsAsc = [...history.ownerships].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  ownershipsAsc.forEach((ownership, index) => {
    const owner =
      ownership.dealership?.name ?? userName(ownership.user);
    entries.push({
      id: `ownership:${ownership.id}`,
      date: ownership.startsAt,
      dateKind: "instant",
      dateOnly: null,
      type: "ownership",
      title:
        index === 0
          ? "Inicio de propiedad"
          : owner
            ? `Propiedad transferida a ${owner}`
            : "Propiedad transferida",
      actor: owner || undefined,
      notes: ownership.notes ?? undefined,
    });
  });

  // Iteración 2-3 (D-069..D-071): episodios owner + workshop. `?? []`
  // defensivo: si el backend aún no devuelve el 4º array, el merge no rompe.
  for (const care of history.careEpisodes ?? []) {
    // Precedencia: SNAPSHOT primero, relación viva solo como fallback
    // (PDP-3 / PROD-005). Espejo de `get-care-episode.handler.ts` y de
    // `servicios/[servicioId]/page.tsx:268`.
    //
    // Antes era `workshop?.name ?? workshopName`, lo opuesto al backend: eso
    // hacía que renombrar un taller reescribiera el nombre en el timeline
    // retroactivamente, contradiciendo PROD-005. Al tener todas las filas
    // pre-fix con `workshopName = null`, el cambio es hoy un no-op y solo
    // empieza a verse cuando el backend deje de escribir el snapshot.
    const workshopName =
      care.workshopName ?? care.workshop?.name ?? "";

    // Título: `title` presente → se usa; null → fallback por source (D-071).
    const baseTitle =
      care.title ??
      (care.source === "workshop" ? "Atención de taller" : "Servicio registrado");
    const title =
      care.status === "cancelled" ? `${baseTitle} (cancelada)` : baseTitle;

    // Actor D-071: el taller denota la fuente confiable (D-064); el owner
    // reemplaza su actor por "Verificado por {taller}" SOLO si verification
    // === "verified" — nunca por presencia del taller asignado (TL §3.3).
    let actor: string;
    let badge: string | undefined;
    if (care.source === "workshop") {
      actor = `Taller ${workshopName}`.trim();
    } else if (care.verification === "verified") {
      actor = `Verificado por ${workshopName}`.trim();
    } else if (care.verification === "rejected") {
      // Rechazo de verificación (diseño aprobado): el ACTOR se mantiene
      // "Registrado por el propietario" (D-063 — el origen no cambia); el
      // estado viaja en el badge.
      actor = "Registrado por el propietario";
      badge = workshopName
        ? `Rechazado por ${workshopName}`
        : "Rechazado por el taller responsable";
    } else {
      actor = "Registrado por el propietario";
      badge = "Pendiente de verificación";
    }

    // Plan 05 / F-TZ-6 (D-TZ-7): `serviceDate` solo es fecha calendario si
    // valida como date-only (`YYYY-MM-DD` o medianoche UTC). Un ISO con hora
    // real (p. ej. los `09:00Z` del seed) se trata como instante: nunca se
    // trunca. `date` sigue siendo el valor crudo de orden D-070.
    const dateOnly = toDateOnly(care.serviceDate);

    entries.push({
      id: `care:${care.id}`,
      date: care.serviceDate ?? care.checkedInAt ?? care.createdAt,
      dateKind: dateOnly ? "date" : "instant",
      dateOnly,
      type: "care",
      title,
      actor,
      badge,
      notes: care.customerNotes ?? undefined,
      careId: care.id,
    });
  }

  return entries.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}