/**
 * Milestone consignación — Tests de la sección de exhibición (D-105 / spec §8).
 *
 * Cubre:
 * - Lista los vehículos de GET /dealerships/:id/vehicles.
 * - La placa enlaza al detalle del vehículo (/vehicles/[id]) — acceso al
 *   historial desde la concesionaria.
 * - Acciones por vehículo: Vender (QR sale) y Devolver (QR return).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DealershipExhibitionSection } from "@/components/dealership/dealership-exhibition-section";

const mockListVehicles = vi.fn();

vi.mock("@/lib/api", () => ({
  dealershipApi: {
    listVehicles: (...args: unknown[]) => mockListVehicles(...args),
  },
}));

// El panel QR solo se monta al accionar Vender/Devolver; fuera de alcance acá.
vi.mock("@/components/transfer/qr-transfer-panel", () => ({
  QrTransferPanel: () => null,
}));

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DealershipExhibitionSection dealershipId="d1" />
    </QueryClientProvider>,
  );
}

const VEHICLE = {
  id: "v1",
  licensePlate: "BCD234",
  brand: "Renault",
  model: "Sandero",
  version: "1.6 SCe",
  manufactureYear: 2022,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DealershipExhibitionSection", () => {
  it("lista los vehículos en exhibición y enlaza la placa al detalle del vehículo", async () => {
    mockListVehicles.mockResolvedValue([VEHICLE]);
    renderSection();

    const link = await screen.findByRole("link", { name: "BCD234" });
    expect(link).toHaveAttribute("href", "/vehicles/v1");
    expect(
      screen.getByText(/Renault Sandero 1\.6 SCe/),
    ).toBeInTheDocument();

    expect(mockListVehicles).toHaveBeenCalledWith("d1");
  });

  it("expone las acciones Vender y Devolver por vehículo", async () => {
    mockListVehicles.mockResolvedValue([VEHICLE]);
    renderSection();

    expect(
      await screen.findByRole("button", { name: /vender/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /devolver/i }),
    ).toBeInTheDocument();
  });

  it("muestra empty state cuando no hay vehículos en exhibición", async () => {
    mockListVehicles.mockResolvedValue([]);
    renderSection();

    expect(
      await screen.findByText(/sin vehículos en exhibición/i),
    ).toBeInTheDocument();
  });
});
