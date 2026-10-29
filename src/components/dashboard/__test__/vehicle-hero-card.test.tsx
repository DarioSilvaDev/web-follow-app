/**
 * VehicleHeroCard — tarjeta principal del vehículo activo.
 *
 * Comportamientos críticos:
 * - Identidad: catálogo, patente y año (desde el DETALLE, no el listado).
 * - Kilometraje actual distingue "0 km registrado" de "no registrado".
 * - Estado de la historia derivado SOLO de careEpisodes reales
 *   (sin historial / requiere verificación / verificada).
 * - Titular: solo cuando el backend confirma un ownership ACTIVO
 *   (`endsAt === null`) — nunca se asume.
 * - "Registrar atención" solo cuando el caller pasa la ruta (actor
 *   autorizado); "Ver historia completa" siempre.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

import {
  VehicleHeroCard,
  deriveHistoryStatus,
  activeOwnerLabel,
} from "@/components/dashboard/vehicle-hero-card";
import type { Vehicle, VehicleCareEpisode } from "@/types/vehicle";

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "v1",
    licensePlate: "ABC123",
    brand: "Toyota",
    model: "Corolla Cross",
    version: null,
    manufactureYear: 2022,
    modelYear: 2022,
    color: "Gris",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeCareEpisode(
  overrides: Partial<VehicleCareEpisode> = {},
): VehicleCareEpisode {
  return {
    id: "c1",
    title: "Cambio de aceite",
    serviceDate: "2026-06-18T00:00:00.000Z",
    status: "delivered",
    source: "workshop",
    verification: "verified",
    mileageIn: 42000,
    customerNotes: null,
    checkedInAt: null,
    createdAt: "2026-06-18T00:00:00.000Z",
    workshop: { id: "w1", name: "Taller Norte" },
    workshopName: "Taller Norte",
    ...overrides,
  };
}

describe("VehicleHeroCard", () => {
  it("muestra identidad, kilometraje actual y acciones", () => {
    const vehicle = makeVehicle({
      mileages: [
        {
          id: "m1",
          vehicleId: "v1",
          mileage: 42380,
          source: "owner",
          recordedAt: "2026-07-01T00:00:00.000Z",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    });

    render(
      <VehicleHeroCard
        vehicle={vehicle}
        careEpisodes={[makeCareEpisode()]}
        registerCareHref="/vehicles/v1/servicios/nueva"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Toyota Corolla Cross" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(screen.getByText("2022 / 2022 · Gris")).toBeInTheDocument();
    // Número grande con formato es-AR
    expect(screen.getByText("42.380")).toBeInTheDocument();
    expect(screen.getByText("km")).toBeInTheDocument();

    // Acciones
    const historia = screen.getByRole("link", {
      name: /Ver historia completa/,
    });
    expect(historia).toHaveAttribute("href", "/vehicles/v1");
    const registrar = screen.getByRole("link", { name: /Registrar atención/ });
    expect(registrar).toHaveAttribute(
      "href",
      "/vehicles/v1/servicios/nueva",
    );
  });

  it("sin registros de odómetro muestra 'Kilometraje no registrado'", () => {
    render(<VehicleHeroCard vehicle={makeVehicle({ mileages: [] })} />);

    expect(
      screen.getByText("Kilometraje no registrado"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/42\.380/)).not.toBeInTheDocument();
  });

  it("oculta 'Registrar atención' cuando no hay ruta (actor no autorizado)", () => {
    render(<VehicleHeroCard vehicle={makeVehicle()} />);

    expect(
      screen.queryByRole("link", { name: /Registrar atención/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ver historia completa/ }),
    ).toBeInTheDocument();
  });

  it("muestra el estado de la historia derivado del historial", () => {
    const { rerender } = render(
      <VehicleHeroCard vehicle={makeVehicle()} careEpisodes={[]} />,
    );
    expect(screen.getByText("Sin historial")).toBeInTheDocument();

    rerender(
      <VehicleHeroCard
        vehicle={makeVehicle()}
        careEpisodes={[makeCareEpisode({ verification: "unverified" })]}
      />,
    );
    expect(screen.getByText("Requiere verificación")).toBeInTheDocument();

    rerender(
      <VehicleHeroCard
        vehicle={makeVehicle()}
        careEpisodes={[makeCareEpisode()]}
      />,
    );
    expect(screen.getByText("Historia verificada")).toBeInTheDocument();
  });

  it("muestra el titular SOLO con ownership activo confirmado por el backend", () => {
    const active = {
      id: "o1",
      vehicleId: "v1",
      userId: "u1",
      type: "owner" as const,
      startsAt: "2025-01-01T00:00:00.000Z",
      endsAt: null,
      user: { id: "u1", firstName: "Ana", lastName: "Gómez" },
    };
    const historical = { ...active, id: "o2", endsAt: "2026-01-01T00:00:00.000Z" };

    const { rerender } = render(
      <VehicleHeroCard
        vehicle={makeVehicle({ ownerships: [active, historical] })}
      />,
    );
    expect(screen.getByText(/Titular: Ana Gómez/)).toBeInTheDocument();

    // Solo ownerships históricos (todos con endsAt) → NO se muestra titular.
    rerender(
      <VehicleHeroCard vehicle={makeVehicle({ ownerships: [historical] })} />,
    );
    expect(screen.queryByText(/Titular:/)).not.toBeInTheDocument();
  });
});

describe("deriveHistoryStatus", () => {
  it("sin datos → null (no inventa estado)", () => {
    expect(deriveHistoryStatus(undefined)).toBeNull();
  });

  it("sin episodios → Sin historial (neutro)", () => {
    expect(deriveHistoryStatus([])).toMatchObject({
      label: "Sin historial",
      variant: "outline",
    });
  });

  it("algún episodio sin verificar → Requiere verificación", () => {
    const episodes = [
      makeCareEpisode(),
      makeCareEpisode({ id: "c2", verification: "unverified" }),
    ];
    expect(deriveHistoryStatus(episodes)).toMatchObject({
      label: "Requiere verificación",
      variant: "warning",
    });
  });

  it("todos verificados → Historia verificada", () => {
    expect(deriveHistoryStatus([makeCareEpisode()])).toMatchObject({
      label: "Historia verificada",
      variant: "success",
    });
  });
});

describe("activeOwnerLabel", () => {
  it("titular organizacional → nombre de la concesionaria", () => {
    const vehicle = makeVehicle({
      ownerships: [
        {
          id: "o1",
          vehicleId: "v1",
          userId: null,
          type: "company",
          startsAt: "2025-01-01T00:00:00.000Z",
          endsAt: null,
          dealershipId: "d1",
          dealership: { id: "d1", name: "Autos del Sur" },
        },
      ],
    });
    expect(activeOwnerLabel(vehicle)).toBe("Autos del Sur (concesionaria)");
  });

  it("sin ownership activo → null (acceso compartido sin titular)", () => {
    expect(activeOwnerLabel(makeVehicle({ ownerships: [] }))).toBeNull();
  });
});
