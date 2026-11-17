/**
 * VehicleHeroCard — tarjeta principal del vehículo activo.
 *
 * Comportamientos críticos:
 * - Identidad: catálogo, patente y año (desde el DETALLE, no el listado).
 * - Kilometraje actual distingue "0 km registrado" de "no registrado"; sin
 *   registros y con permiso (`canRecordMileage`) ofrece "Registrar", que abre
 *   el dialog en modo register; con registros y permiso ofrece "Actualizar"
 *   (modo update). Sin permiso, ninguno de los dos CTAs aparece.
 * - Sin VehicleMileage pero con una atención no cancelada que declaró km
 *   (PM E): muestra ese dato ETIQUETADO ("Pendiente de verificación" +
 *   procedencia) con "Confirmar kilometraje" (pre-carga el dialog) y
 *   "Actualizar" (input vacío). Episodios cancelados/ilegibles no cuentan;
 *   se prefiere `mileageOut` sobre `mileageIn`.
 * - Estado de la historia derivado SOLO de careEpisodes reales
 *   (sin historial / requiere verificación / verificada).
 * - Titular: solo cuando el backend confirma un ownership ACTIVO
 *   (`endsAt === null`) — nunca se asume.
 * - "Registrar servicio" solo cuando el caller pasa la ruta (actor
 *   autorizado); "Ver historia completa" siempre.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

// El dialog real necesita QueryClientProvider + portal de Base UI; acá se
// verifica solo la integración del hero (botón → apertura y modo). Su lógica
// tiene cobertura propia en src/components/vehicle/__test__/mileage-register-dialog.
vi.mock("@/components/vehicle/mileage-register-dialog", () => ({
  MileageRegisterDialog: ({
    open,
    vehicle,
    mode,
    currentMileage,
    defaultMileage,
  }: {
    open: boolean;
    vehicle: { id: string; licensePlate: string };
    mode?: "register" | "update";
    currentMileage?: number;
    defaultMileage?: number;
  }) => (
    <div data-testid="mileage-register-dialog">
      <span data-testid="mileage-dialog-open">{String(open)}</span>
      <span data-testid="mileage-dialog-vehicle">{vehicle.licensePlate}</span>
      <span data-testid="mileage-dialog-mode">{mode ?? "register"}</span>
      <span data-testid="mileage-dialog-current">
        {currentMileage === undefined ? "" : String(currentMileage)}
      </span>
      <span data-testid="mileage-dialog-default">
        {defaultMileage === undefined ? "" : String(defaultMileage)}
      </span>
    </div>
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
    mileageOut: null,
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
    const registrar = screen.getByRole("link", { name: /Registrar servicio/ });
    expect(registrar).toHaveAttribute(
      "href",
      "/vehicles/v1/servicios/nueva",
    );
  });

  it("sin registros de odómetro muestra 'Kilometraje no registrado' + CTA con permiso", async () => {
    const user = userEvent.setup();
    render(
      <VehicleHeroCard
        vehicle={makeVehicle({ mileages: [] })}
        canRecordMileage
      />,
    );

    expect(
      screen.getByText("Kilometraje no registrado"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/42\.380/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Sumá el kilometraje actual para completar la ficha."),
    ).toBeInTheDocument();

    // El dialog arranca cerrado; el botón lo abre con la patente del vehículo.
    expect(screen.getByTestId("mileage-dialog-open")).toHaveTextContent("false");
    expect(screen.getByTestId("mileage-dialog-mode")).toHaveTextContent(
      "register",
    );
    await user.click(
      screen.getByRole("button", { name: /registrar kilometraje/i }),
    );
    expect(screen.getByTestId("mileage-dialog-open")).toHaveTextContent("true");
    expect(screen.getByTestId("mileage-dialog-mode")).toHaveTextContent(
      "register",
    );
    expect(screen.getByTestId("mileage-dialog-vehicle")).toHaveTextContent(
      "ABC123",
    );
  });

  it("sin permiso de kilometraje no muestra el CTA 'Registrar'", () => {
    render(
      <VehicleHeroCard
        vehicle={makeVehicle({ mileages: [] })}
        canRecordMileage={false}
      />,
    );

    expect(
      screen.getByText("Kilometraje no registrado"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /registrar kilometraje/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Sumá el kilometraje actual para completar la ficha."),
    ).not.toBeInTheDocument();
  });

  it("con kilometraje ya registrado y permiso ofrece 'Actualizar' (modo update), no 'Registrar'", async () => {
    const user = userEvent.setup();
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

    render(<VehicleHeroCard vehicle={vehicle} canRecordMileage />);

    expect(screen.getByText("42.380")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /registrar kilometraje/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Sumá el kilometraje actual para completar la ficha."),
    ).not.toBeInTheDocument();

    // El botón "Actualizar" abre el dialog en modo update con el km actual.
    expect(screen.getByTestId("mileage-dialog-mode")).toHaveTextContent(
      "update",
    );
    expect(screen.getByTestId("mileage-dialog-current")).toHaveTextContent(
      "42380",
    );
    expect(screen.getByTestId("mileage-dialog-open")).toHaveTextContent(
      "false",
    );
    await user.click(
      screen.getByRole("button", { name: /actualizar kilometraje/i }),
    );
    expect(screen.getByTestId("mileage-dialog-open")).toHaveTextContent("true");
    expect(screen.getByTestId("mileage-dialog-mode")).toHaveTextContent(
      "update",
    );
  });

  it("con kilometraje ya registrado y sin permiso no ofrece 'Actualizar'", () => {
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

    render(<VehicleHeroCard vehicle={vehicle} canRecordMileage={false} />);

    expect(screen.getByText("42.380")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /actualizar kilometraje/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /registrar kilometraje/i }),
    ).not.toBeInTheDocument();
  });

  it("con km declarado en la atención y sin registros muestra el dato con procedencia + CTA Confirmar", async () => {
    const user = userEvent.setup();
    render(
      <VehicleHeroCard
        vehicle={makeVehicle({ mileages: [] })}
        canRecordMileage
        careEpisodes={[
          makeCareEpisode({
            source: "workshop",
            workshopName: "Lo de Ceci",
            workshop: { id: "w1", name: "Lo de Ceci" },
            mileageIn: 123123,
            mileageOut: null,
            serviceDate: "2026-11-16T00:00:00.000Z",
          }),
        ]}
      />,
    );

    expect(screen.getByText("123.123")).toBeInTheDocument();
    expect(screen.getByText("km")).toBeInTheDocument();
    expect(screen.queryByText("Kilometraje no registrado")).not.toBeInTheDocument();
    // Nunca presentado como verificado: badge + procedencia visible.
    expect(screen.getByText("Pendiente de verificación")).toBeInTheDocument();
    expect(
      screen.getByText(/Dato declarado por el taller Lo de Ceci/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/odómetro de ingreso/),
    ).toBeInTheDocument();
    expect(screen.getByText(/No verificado por vos/)).toBeInTheDocument();

    // "Confirmar" (primario) abre el dialog pre-cargado.
    await user.click(
      screen.getByRole("button", { name: /confirmar kilometraje/i }),
    );
    expect(screen.getByTestId("mileage-dialog-open")).toHaveTextContent("true");
    expect(screen.getByTestId("mileage-dialog-mode")).toHaveTextContent(
      "register",
    );
    expect(screen.getByTestId("mileage-dialog-default")).toHaveTextContent(
      "123123",
    );
  });

  it("'Actualizar' desde el dato declarado abre el dialog con el input vacío", async () => {
    const user = userEvent.setup();
    render(
      <VehicleHeroCard
        vehicle={makeVehicle({ mileages: [] })}
        canRecordMileage
        careEpisodes={[
          makeCareEpisode({ mileageIn: 123123, mileageOut: null }),
        ]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /actualizar kilometraje/i }),
    );
    expect(screen.getByTestId("mileage-dialog-open")).toHaveTextContent("true");
    expect(screen.getByTestId("mileage-dialog-default")).toHaveTextContent(
      "",
    );
  });

  it("prefiere mileageOut (salida) sobre mileageIn (ingreso)", () => {
    render(
      <VehicleHeroCard
        vehicle={makeVehicle({ mileages: [] })}
        careEpisodes={[
          makeCareEpisode({ mileageIn: 100000, mileageOut: 100500 }),
        ]}
      />,
    );

    expect(screen.getByText("100.500")).toBeInTheDocument();
    expect(screen.getByText(/odómetro de salida/)).toBeInTheDocument();
  });

  it("ignora episodios cancelados y sin odómetro legible", () => {
    const { rerender } = render(
      <VehicleHeroCard
        vehicle={makeVehicle({ mileages: [] })}
        careEpisodes={[
          makeCareEpisode({ status: "cancelled", mileageIn: 123123 }),
        ]}
      />,
    );
    expect(
      screen.getByText("Kilometraje no registrado"),
    ).toBeInTheDocument();

    rerender(
      <VehicleHeroCard
        vehicle={makeVehicle({ mileages: [] })}
        careEpisodes={[
          makeCareEpisode({
            id: "c2",
            status: "delivered",
            mileageIn: null,
            mileageOut: null,
          }),
        ]}
      />,
    );
    expect(
      screen.getByText("Kilometraje no registrado"),
    ).toBeInTheDocument();
  });

  it("toma el episodio más reciente con lectura entre varios", () => {
    render(
      <VehicleHeroCard
        vehicle={makeVehicle({ mileages: [] })}
        careEpisodes={[
          makeCareEpisode({
            id: "c-first",
            mileageIn: 111111,
            serviceDate: "2026-11-17T00:00:00.000Z",
          }),
          makeCareEpisode({
            id: "c-second",
            mileageIn: 99999,
            serviceDate: "2026-11-10T00:00:00.000Z",
          }),
        ]}
      />,
    );

    expect(screen.getByText("111.111")).toBeInTheDocument();
  });

  it("sin permiso muestra el dato declarado con badge, pero sin CTAs de registro", () => {
    render(
      <VehicleHeroCard
        vehicle={makeVehicle({ mileages: [] })}
        canRecordMileage={false}
        careEpisodes={[makeCareEpisode({ mileageIn: 123123 })]}
      />,
    );

    expect(screen.getByText("123.123")).toBeInTheDocument();
    expect(screen.getByText("Pendiente de verificación")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /confirmar kilometraje/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /actualizar kilometraje/i }),
    ).not.toBeInTheDocument();
  });

  it("un VehicleMileage registrado gana siempre sobre el dato declarado", () => {
    const vehicle = makeVehicle({
      mileages: [
        {
          id: "m1",
          vehicleId: "v1",
          mileage: 42000,
          source: "owner",
          recordedAt: "2026-07-01T00:00:00.000Z",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    });

    render(
      <VehicleHeroCard
        vehicle={vehicle}
        careEpisodes={[makeCareEpisode({ mileageIn: 99999 })]}
      />,
    );

    expect(screen.getByText("42.000")).toBeInTheDocument();
    expect(screen.queryByText("99.999")).not.toBeInTheDocument();
  });

  it("oculta 'Registrar servicio' cuando no hay ruta (actor no autorizado)", () => {
    render(<VehicleHeroCard vehicle={makeVehicle()} />);

    expect(
      screen.queryByRole("link", { name: /Registrar servicio/ }),
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

  it("alguno rechazado (sin pendientes) → 'Verificación rechazada', nunca 'Requiere verificación'", () => {
    expect(
      deriveHistoryStatus([
        makeCareEpisode({ verification: "rejected" }),
        makeCareEpisode({ id: "c2", verification: "verified" }),
      ]),
    ).toMatchObject({
      label: "Verificación rechazada",
      variant: "warning",
    });
    // Un rechazo NO cuenta como pendiente de verificación.
    expect(
      deriveHistoryStatus([makeCareEpisode({ verification: "rejected" })])?.label,
    ).toBe("Verificación rechazada");
  });

  it("rechazado + sin verificar → gana el pendiente ('Requiere verificación')", () => {
    expect(
      deriveHistoryStatus([
        makeCareEpisode({ verification: "rejected" }),
        makeCareEpisode({ id: "c2", verification: "unverified" }),
      ]),
    ).toMatchObject({ label: "Requiere verificación" });
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
