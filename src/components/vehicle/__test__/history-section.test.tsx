/**
 * Plan 05 — F-TZ-7 (regresión R1) + F-TZ-6: el Historial formatea por
 * SEMÁNTICA (`entry.dateKind`), no por heurística sobre el string.
 *
 * Comportamientos protegidos:
 * - R1: un INSTANTE de medianoche (`…T00:00:00Z`) sigue mostrando solo fecha,
 *   sin `00:00` (no se rompe el render de `createdAt`/`startsAt`).
 * - R2/instant: un instante con hora real conserva su hora (hora local).
 * - fecha calendario (`serviceDate` de medianoche UTC) se rinde en UTC: día 11,
 *   nunca 10 — aunque la TZ del proceso sea UTC-3.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { HistorySection } from "@/components/vehicle/history-section";
import type {
  VehicleCareEpisode,
  VehicleHistoryResponse,
  VehicleTransfer,
} from "@/types/vehicle";

// El Link real necesita router context → mock funcional (patrón del repo).
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

function makeTransfer(overrides: Partial<VehicleTransfer> = {}): VehicleTransfer {
  return {
    id: "t1",
    vehicleId: "v1",
    fromUser: { id: "u1", firstName: "Juan", lastName: "Perez" },
    toUser: { id: "u2", firstName: "Maria", lastName: "Lopez" },
    status: "completed",
    requestedAt: "2026-11-10T12:00:00.000Z",
    respondedAt: null,
    completedAt: null,
    expiresAt: null,
    notes: null,
    createdAt: "2026-11-11T00:00:00.000Z",
    ...overrides,
  };
}

function makeCareEpisode(
  overrides: Partial<VehicleCareEpisode> = {},
): VehicleCareEpisode {
  return {
    id: "c1",
    title: "Cambio de aceite",
    serviceDate: "2026-11-11T00:00:00.000Z",
    status: "delivered",
    source: "owner",
    verification: "unverified",
    mileageIn: 68500,
    mileageOut: null,
    customerNotes: null,
    checkedInAt: null,
    createdAt: "2026-11-11T10:00:00.000Z",
    workshop: null,
    workshopName: null,
    ...overrides,
  };
}

function historyWith(
  overrides: Partial<VehicleHistoryResponse> = {},
): VehicleHistoryResponse {
  return {
    transfers: [],
    mileages: [],
    ownerships: [],
    careEpisodes: [],
    ...overrides,
  };
}

function renderHistory(history: VehicleHistoryResponse) {
  return render(
    <HistorySection
      history={history}
      isLoading={false}
      isError={false}
      refetch={vi.fn()}
      vehicleId="v1"
    />,
  );
}

/** Devuelve el texto del `<time>` de la entrada cuyo título contiene `title`. */
function timeTextFor(title: RegExp): string {
  const heading = screen.getByText(title);
  const item = heading.closest("li");
  if (!item) throw new Error(`No se encontró el <li> de ${String(title)}`);
  const time = item.querySelector("time");
  if (!time) throw new Error(`No se encontró el <time> de ${String(title)}`);
  return time.textContent ?? "";
}

describe("HistorySection — fechas por semántica (Plan 05 / F-TZ-7)", () => {
  it("guarda de entorno: TZ pinneada (C4)", () => {
    expect([
      "America/Argentina/Buenos_Aires",
      "America/Buenos_Aires",
    ]).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(new Date("2026-11-11T00:00:00.000Z").getTimezoneOffset()).toBe(180);
  });

  it("R1: una transferencia a medianoche UTC sigue mostrando SOLO fecha (sin 00:00)", () => {
    renderHistory(historyWith({ transfers: [makeTransfer()] }));

    const text = timeTextFor(/Transferencia completada/);
    // El día es el local (UTC-3), igual que antes del cambio; lo que protege
    // R1 es que NO aparece la hora de medianoche.
    expect(text).toBe("10/11/2026");
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
    expect(text).not.toContain("00:00");
  });

  it("R1: un instante con hora real conserva su hora (no se pierde el comportamiento)", () => {
    // 14:05 UTC = 11:05 en America/Argentina/Buenos_Aires (UTC-3).
    renderHistory(
      historyWith({
        transfers: [makeTransfer({ createdAt: "2026-11-11T14:05:00.000Z" })],
      }),
    );

    const text = timeTextFor(/Transferencia completada/);
    expect(text).toContain("11/11/2026");
    expect(text).toMatch(/\d{1,2}:05/);
  });

  it("fecha calendario (serviceDate medianoche UTC) se rinde en UTC: día 11, no 10", () => {
    renderHistory(historyWith({ careEpisodes: [makeCareEpisode()] }));

    const text = timeTextFor(/Cambio de aceite/);
    // Mismo formato que los instantes de esta lista (`dd/mm/yyyy`): el 11 es
    // el día calendario UTC, nunca el 10 local.
    expect(text).toBe("11/11/2026");
    expect(text).not.toContain("00:00");
  });

  it("un serviceDate con hora real NO se trunca: cae a instante (día/hora local)", () => {
    // Seed: episodios workshop con `serviceDate` a las 09:00Z (Plan 05 §0).
    renderHistory(
      historyWith({
        careEpisodes: [
          makeCareEpisode({
            id: "c-seed",
            serviceDate: "2026-11-11T09:00:00.000Z",
            checkedInAt: null,
            createdAt: "2026-11-11T09:00:00.000Z",
          }),
        ],
      }),
    );

    const text = timeTextFor(/Cambio de aceite/);
    // 09:00Z en UTC-3 = 06:00 → se muestra la hora local, nunca se trunca el día.
    expect(text).toContain("11/11/2026");
    expect(text).toMatch(/\d{1,2}:00/);
  });

  it("episodio sin serviceDate usa el instante (checkedInAt) en hora local", () => {
    renderHistory(
      historyWith({
        careEpisodes: [
          makeCareEpisode({
            serviceDate: null,
            checkedInAt: "2026-11-12T02:00:00.000Z",
            createdAt: "2026-11-11T10:00:00.000Z",
          }),
        ],
      }),
    );

    // 02:00Z del 12 = 23:00 del 11 en UTC-3 → día local 11 con hora.
    const text = timeTextFor(/Cambio de aceite/);
    expect(text).toContain("11/11/2026");
    expect(text).toMatch(/\d{1,2}:\d{2}/);
  });

  it("el atributo dateTime del <time> sigue siendo el ISO de orden (no la fecha calendario)", () => {
    renderHistory(historyWith({ careEpisodes: [makeCareEpisode()] }));

    const heading = screen.getByText(/Cambio de aceite/);
    const item = heading.closest("li");
    const time = (item as HTMLElement).querySelector("time");
    expect(time?.getAttribute("dateTime")).toBe("2026-11-11T00:00:00.000Z");
  });
});
