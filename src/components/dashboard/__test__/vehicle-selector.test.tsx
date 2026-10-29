/**
 * VehicleSelector — selector del vehículo activo del dashboard.
 *
 * Comportamientos críticos:
 * - Trigger accesible (`aria-haspopup="listbox"`, `aria-expanded`,
 *   `aria-controls`) y label descriptivo.
 * - Abrir/cerrar: Escape devuelve el foco al trigger; click fuera cierra.
 * - Seleccionar una opción emite `onSelect(id)` y cierra.
 * - Estado sin vehículo activo → placeholder explícito (sin datos falsos).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VehicleSelector } from "@/components/dashboard/vehicle-selector";
import type { Vehicle } from "@/types/vehicle";

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "v1",
    licensePlate: "ABC123",
    brand: "Toyota",
    model: "Corolla Cross",
    version: null,
    manufactureYear: 2022,
    modelYear: 2022,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const VEHICLES = [
  makeVehicle(),
  makeVehicle({ id: "v2", licensePlate: "XYZ789", brand: "Ford", model: "Ka" }),
];

describe("VehicleSelector", () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el vehículo activo (catálogo + patente) en el trigger", () => {
    render(
      <VehicleSelector
        vehicles={VEHICLES}
        activeVehicleId="v1"
        onSelect={onSelect}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: /Vehículo activo: Toyota Corolla Cross ABC123/,
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", "vehicle-selector-list");
    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(screen.getByText("2022 / 2022")).toBeInTheDocument();
  });

  it("sin vehículo activo muestra un placeholder explícito", () => {
    render(
      <VehicleSelector vehicles={VEHICLES} activeVehicleId={null} onSelect={onSelect} />,
    );

    const trigger = screen.getByRole("button", { name: "Elegí un vehículo" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("listbox", { name: "Vehículos disponibles" }),
    ).not.toBeInTheDocument();
  });

  it("al abrir despliega el listbox con todas las opciones", async () => {
    const user = userEvent.setup();
    render(
      <VehicleSelector
        vehicles={VEHICLES}
        activeVehicleId="v1"
        onSelect={onSelect}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Vehículo activo/ }),
    );

    const listbox = screen.getByRole("listbox", {
      name: "Vehículos disponibles",
    });
    expect(listbox).toBeInTheDocument();

    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    expect(
      screen.getByRole("button", { name: /Vehículo activo/ }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("seleccionar una opción emite onSelect con el id y cierra", async () => {
    const user = userEvent.setup();
    render(
      <VehicleSelector
        vehicles={VEHICLES}
        activeVehicleId="v1"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Vehículo activo/ }));
    await user.click(screen.getByRole("option", { name: /XYZ789/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("v2");
    expect(
      screen.queryByRole("listbox", { name: "Vehículos disponibles" }),
    ).not.toBeInTheDocument();
  });

  it("Escape cierra el listbox sin seleccionar", async () => {
    const user = userEvent.setup();
    render(
      <VehicleSelector
        vehicles={VEHICLES}
        activeVehicleId="v1"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Vehículo activo/ }));
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("listbox", { name: "Vehículos disponibles" }),
    ).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Vehículo activo/ }),
    ).toHaveFocus();
  });
});
