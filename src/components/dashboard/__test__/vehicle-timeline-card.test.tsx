/**
 * VehicleTimelineCard — últimos registros del historial en el dashboard.
 *
 * Comportamientos críticos:
 * - Reutiliza `mergeHistory` (no duplica lógica de las 4 fuentes).
 * - El taller aparece como REGISTRANTE ("Registrado por …"), nunca como
 *   propietario.
 * - Muestra km y verificación de la atención desde el crudo de careEpisodes.
 * - Estados: loading (status accesible), error con reintento, vacío
 *   accionable ("Todavía no hay atenciones registradas").
 * - Deep-link a detalle solo para entradas tipo care (`careId`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VehicleTimelineCard } from "@/components/dashboard/vehicle-timeline-card";
import type {
  VehicleCareEpisode,
  VehicleHistoryResponse,
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

function makeCareEpisode(
  overrides: Partial<VehicleCareEpisode> = {},
): VehicleCareEpisode {
  return {
    id: "c1",
    title: "Mantenimiento preventivo",
    serviceDate: "2026-06-18T00:00:00.000Z",
    status: "delivered",
    source: "workshop",
    verification: "verified",
    mileageIn: 42380,
    customerNotes: null,
    checkedInAt: null,
    createdAt: "2026-06-18T00:00:00.000Z",
    workshop: { id: "w1", name: "Taller Norte" },
    workshopName: "Taller Norte",
    ...overrides,
  };
}

const EMPTY_HISTORY: VehicleHistoryResponse = {
  transfers: [],
  mileages: [],
  ownerships: [],
  careEpisodes: [],
};

function historyWithCare(
  episodes: VehicleCareEpisode[],
): VehicleHistoryResponse {
  return { ...EMPTY_HISTORY, careEpisodes: episodes };
}

describe("VehicleTimelineCard", () => {
  const onRetry = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza los últimos registros con registrante, km y verificación", () => {
    render(
      <VehicleTimelineCard
        vehicleId="v1"
        historyStatus="success"
        history={historyWithCare([makeCareEpisode()])}
        onRetry={onRetry}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Últimos registros" }),
    ).toBeInTheDocument();

    const list = screen.getByRole("list");
    const item = within(list).getByRole("listitem");
    // Título + registrante (taller = registrante, NO propietario)
    expect(item).toHaveTextContent("Mantenimiento preventivo");
    expect(item).toHaveTextContent("Registrado por Taller Norte");
    expect(item).toHaveTextContent("42.380 km");
    expect(item).toHaveTextContent("Verificado");

    // Deep-link al detalle de la atención
    const detalle = within(item).getByRole("link", { name: /Ver detalle/ });
    expect(detalle).toHaveAttribute("href", "/vehicles/v1/servicios/c1");
  });

  it("marca 'Pendiente de verificación' en episodios sin verificar", () => {
    render(
      <VehicleTimelineCard
        vehicleId="v1"
        historyStatus="success"
        history={historyWithCare([
          makeCareEpisode({
            id: "c2",
            source: "owner",
            workshop: null,
            workshopName: null,
            verification: "unverified",
          }),
        ])}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Pendiente de verificación")).toBeInTheDocument();
    expect(screen.getByText("Registrado por el propietario")).toBeInTheDocument();
  });

  it("episodio del dueño con nombre de taller SIN verificar → NO dice 'Verificado por'", () => {
    // Regla de dominio: "Verificado por {taller}" requiere
    // verification=verified; el nombre de taller solo identifica al
    // registrante. Evita la contradicción con el badge "Pendiente".
    render(
      <VehicleTimelineCard
        vehicleId="v1"
        historyStatus="success"
        history={historyWithCare([
          makeCareEpisode({
            id: "c3",
            source: "owner",
            workshop: null,
            workshopName: "Taller El Rayo",
            verification: "unverified",
          }),
        ])}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Pendiente de verificación")).toBeInTheDocument();
    expect(screen.queryByText(/Verificado por/)).not.toBeInTheDocument();
    expect(screen.getByText("Registrado por el propietario")).toBeInTheDocument();
  });

  it("historial vacío → estado vacío accionable con CTA", () => {
    render(
      <VehicleTimelineCard
        vehicleId="v1"
        historyStatus="success"
        history={EMPTY_HISTORY}
        onRetry={onRetry}
        registerCareHref="/atenciones/nueva"
      />,
    );

    expect(
      screen.getByText("Todavía no hay atenciones registradas"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Registrar atención/ }),
    ).toHaveAttribute("href", "/atenciones/nueva");
  });

  it("historial vacío sin CTA → sin botón de registro", () => {
    render(
      <VehicleTimelineCard
        vehicleId="v1"
        historyStatus="success"
        history={EMPTY_HISTORY}
        onRetry={onRetry}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /Registrar atención/ }),
    ).not.toBeInTheDocument();
  });

  it("loading expone un estado accesible", () => {
    render(
      <VehicleTimelineCard
        vehicleId="v1"
        historyStatus="loading"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Cargando historial",
    );
  });

  it("error muestra reintento que llama onRetry", async () => {
    const user = userEvent.setup();
    render(
      <VehicleTimelineCard
        vehicleId="v1"
        historyStatus="error"
        onRetry={onRetry}
      />,
    );

    expect(
      screen.getByText("No se pudo cargar el historial del vehículo."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Reintentar/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("respeta el límite de items visibles", () => {
    const episodes = Array.from({ length: 8 }, (_, index) =>
      makeCareEpisode({
        id: `c${index}`,
        title: `Atención ${index}`,
        serviceDate: `2026-06-${String(18 - index).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );

    render(
      <VehicleTimelineCard
        vehicleId="v1"
        historyStatus="success"
        history={historyWithCare(episodes)}
        onRetry={onRetry}
        limit={3}
      />,
    );

    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(
      3,
    );
  });
});
