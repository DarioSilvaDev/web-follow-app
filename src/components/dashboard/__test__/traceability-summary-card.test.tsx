/**
 * Plan 05 — F-TZ-9: "Última atención registrada" del resumen de trazabilidad.
 *
 * Reglas protegidas:
 * - Con `serviceDate` (fecha calendario) → se formatea en UTC: día 11, nunca 10.
 * - Sin `serviceDate` → instante (`checkedInAt ?? createdAt`) en hora local:
 *   jamás se aplica formato date-only (mostraría medianoche UTC → día anterior).
 * - `serviceDate` anómalo (con hora real, p. ej. el `09:00Z` del seed) cae a la
 *   rama de instante en vez de mostrar "—" (D-TZ-7 / R7).
 * - `expiresAt` de documentos NO se toca (sigue formateándose como instante).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { TraceabilitySummaryCard } from "@/components/dashboard/traceability-summary-card";
import type { Vehicle, VehicleCareEpisode } from "@/types/vehicle";

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

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "v1",
    licensePlate: "AB123CD",
    brand: "Toyota",
    model: "Corolla",
    version: null,
    manufactureYear: 2020,
    vin: null,
    color: null,
    photos: [],
    documents: [],
    mileages: [],
    mileageCount: 0,
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    ...overrides,
  };
}

/** Valor de la fila "Última atención registrada" (label → dd). */
function latestCareValue(): string {
  const label = screen.getByText("Última atención registrada");
  const dd = label.parentElement?.querySelector("dd");
  return dd?.textContent ?? "";
}

function renderCard(careEpisodes: VehicleCareEpisode[], vehicle?: Vehicle) {
  return render(
    <TraceabilitySummaryCard
      vehicle={vehicle}
      vehicleId="v1"
      historyStatus="success"
      careEpisodes={careEpisodes}
    />,
  );
}

describe("TraceabilitySummaryCard — última atención (Plan 05 / F-TZ-9)", () => {
  it("guarda de entorno: TZ pinneada (C4)", () => {
    expect([
      "America/Argentina/Buenos_Aires",
      "America/Buenos_Aires",
    ]).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(new Date("2026-11-11T00:00:00.000Z").getTimezoneOffset()).toBe(180);
  });

  it("con serviceDate (medianoche UTC) muestra el día calendario 11, no 10", () => {
    renderCard([makeCareEpisode()]);

    const value = latestCareValue();
    expect(value).toMatch(/\b11\b/);
    expect(value).toMatch(/nov/i);
    expect(value).not.toMatch(/\b10\b/);
  });

  it("sin serviceDate usa checkedInAt como instante en hora local", () => {
    // 2026-11-12T02:00Z = 11/11 23:00 en UTC-3.
    renderCard([
      makeCareEpisode({
        serviceDate: null,
        checkedInAt: "2026-11-12T02:00:00.000Z",
        createdAt: "2026-11-11T10:00:00.000Z",
      }),
    ]);

    const value = latestCareValue();
    expect(value).toMatch(/\b11\b/);
    expect(value).toMatch(/nov/i);
  });

  it("sin serviceDate ni checkedInAt cae a createdAt (nunca '—')", () => {
    renderCard([
      makeCareEpisode({
        serviceDate: null,
        checkedInAt: null,
        createdAt: "2026-11-11T10:00:00.000Z",
      }),
    ]);

    const value = latestCareValue();
    expect(value).not.toBe("—");
    expect(value).toMatch(/\b11\b/);
  });

  it("serviceDate anómalo (09:00Z del seed) NO se trunca ni cae a '—'", () => {
    renderCard([
      makeCareEpisode({
        serviceDate: "2026-11-11T09:00:00.000Z",
        createdAt: "2026-11-11T09:00:00.000Z",
      }),
    ]);

    const value = latestCareValue();
    expect(value).not.toBe("—");
    expect(value).toMatch(/\b11\b/);
  });

  it("expiresAt de documentos sigue formateándose como instante (sin cambios)", () => {
    renderCard(
      [makeCareEpisode()],
      makeVehicle({
        documents: [
          {
            id: "d1",
            vehicleId: "v1",
            key: "docs/factura.pdf",
            name: "Factura",
            documentType: "VTV",
            expiresAt: "2026-11-30T00:00:00.000Z",
            createdAt: "2026-11-01T00:00:00.000Z",
            updatedAt: "2026-11-01T00:00:00.000Z",
          },
        ],
      }),
    );

    // 30/11 00:00Z = 29/11 21:00 local → el render de instante no cambia de familia.
    expect(screen.getByText(/Vencimiento más próximo/)).toBeTruthy();
  });
});

// ── Rechazo de verificación (diseño aprobado) ────────────────────────────────

describe("TraceabilitySummaryCard — rechazo de verificación", () => {
  it("última atención rechazada → 'Rechazado por {taller}' + badge 'Rechazado' (nunca 'Sin verificar')", () => {
    renderCard([
      makeCareEpisode({
        source: "owner",
        verification: "rejected",
        workshop: { id: "w1", name: "Taller Norte" },
        workshopName: "Taller Norte",
      }),
    ]);

    expect(screen.getByText("Rechazado por Taller Norte")).toBeInTheDocument();
    const badge = screen.getByText("Rechazado");
    expect(badge).toBeInTheDocument();
    // Pill tintado del DS (contraste AA): el tono destructivo es ahora
    // `bg-destructive/10` en lugar del pill sólido.
    expect(badge).toHaveClass("bg-destructive/10");
    expect(screen.queryByText("Sin verificar")).not.toBeInTheDocument();
    expect(screen.queryByText("Registrado por el propietario")).not.toBeInTheDocument();
  });

  it("rechazo sin nombre de taller → fallback 'Rechazado por el taller responsable'", () => {
    renderCard([
      makeCareEpisode({
        source: "owner",
        verification: "rejected",
        workshop: null,
        workshopName: null,
      }),
    ]);

    expect(
      screen.getByText("Rechazado por el taller responsable"),
    ).toBeInTheDocument();
    expect(screen.getByText("Rechazado")).toBeInTheDocument();
    expect(screen.queryByText("Sin verificar")).not.toBeInTheDocument();
  });
});
