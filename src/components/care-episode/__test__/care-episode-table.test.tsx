/**
 * CareEpisodeTable — template único del listado de atenciones (F-023).
 *
 * Contrato del rediseño mobile (mockup "Atenciones"):
 * - card de 3 zonas con una SOLA parada de Tab por fila (sin botón anidado);
 * - "Ver detalle" es una etiqueta visual dentro del link;
 * - estado + verificación siguen visibles (nunca solo color);
 * - desktop conserva el grid de 4 columnas y sus encabezados.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CareEpisodeTable } from "@/components/care-episode/care-episode-table";
import type { CareEpisodeListItem } from "@/types/care-episode";

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

function item(overrides: Partial<CareEpisodeListItem> = {}): CareEpisodeListItem {
  return {
    id: "e1",
    vehicleId: "v1",
    title: "Cambio de aceite",
    status: "open",
    source: "owner",
    verification: "unverified",
    canonicalDate: "2026-11-28T12:00:00.000Z",
    canonicalDateOnly: "2026-11-28",
    mileageIn: 18500,
    vehicle: {
      licensePlate: "ABC123",
      brand: "Renault",
      model: "Clio",
      manufactureYear: 2020,
      primaryPhoto: null,
    },
    ...overrides,
  };
}

describe("CareEpisodeTable — rediseño mobile", () => {
  it("renderiza una sola card linkeable por fila, con 'Ver detalle' como etiqueta", () => {
    render(<CareEpisodeTable items={[item()]} showDetails />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/vehicles/v1/servicios/e1");
    expect(links[0].textContent).toContain("Ver detalle");
    expect(links[0].textContent).toContain("Cambio de aceite");
    expect(links[0].parentElement).toHaveClass("rounded-card");
  });

  it("conserva estado y verificación (traceabilidad no depende del color)", () => {
    render(<CareEpisodeTable items={[item()]} showDetails />);

    expect(screen.getByText("Abierto")).toBeInTheDocument();
    expect(
      screen.getByText("Registrado por el propietario"),
    ).toBeInTheDocument();
  });

  it("mantiene el grid de 4 columnas y los encabezados en desktop", () => {
    const { container } = render(
      <CareEpisodeTable items={[item()]} showDetails />,
    );

    expect(screen.getByText("Vehículo")).toBeInTheDocument();
    expect(screen.getByText("Servicio")).toBeInTheDocument();
    expect(screen.getByText("Estado")).toBeInTheDocument();
    expect(screen.getByText("Fecha")).toBeInTheDocument();
    expect(container.querySelector("a")).toHaveClass("md:grid");
    expect(container.querySelector("a")).toHaveClass(
      "md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.35fr)_minmax(0,0.95fr)_minmax(0,0.8fr)]",
    );
  });

  it("no pide fotos cuando no hay miniatura firmada", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<CareEpisodeTable items={[item()]} showDetails />);

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
