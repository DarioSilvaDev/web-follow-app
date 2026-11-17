/**
 * Design System Autentia — fundación de componentes compartidos.
 *
 * Cubre el contrato mínimo de los componentes que usa la pantalla de detalle
 * de servicio como implementación de referencia:
 * - StatusBadge: estado con texto + icono (nunca solo color) y tono mapeado.
 * - InfoField / InfoGrid: etiqueta (12px) antes del valor (15px).
 * - SectionHeader: contador dentro del heading (nombre accesible completo).
 * - PageHeader / PageTitle: h1 de pantalla + metadatos + acciones.
 * - BackLink: navegación de retorno con área táctil de 44px.
 * - InfoCard: superficie con radio de 16px y header opcional.
 * - PrimaryButton: CTA primario de 44px.
 * - EmptyState `compact`: variante para estados dentro de tarjetas.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Gauge, Wrench } from "lucide-react";

import { BackLink, PageHeader, PageTitle } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoCard } from "@/components/ui/info-card";
import { InfoField, InfoGrid } from "@/components/ui/info-field";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";

// El Link real (next/link) necesita router context → mock funcional
// (patrón del repo: admin-foundation.test.tsx).
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

describe("StatusBadge", () => {
  it("mapea cada estado a su label de dominio", () => {
    const cases: Array<[Parameters<typeof StatusBadge>[0]["status"], string]> = [
      ["open", "Abierto"],
      ["delivered", "Entregado"],
      ["cancelled", "Cancelado"],
      ["verified", "Verificado"],
      ["unverified", "Registrado por el propietario"],
      ["rejected", "Rechazado"],
      ["pending", "Pendiente"],
      ["active", "Activo"],
      ["inactive", "Inactivo"],
    ];

    for (const [status, label] of cases) {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("el estado no depende del color: el icono es decorativo y el texto es la señal", () => {
    const { container } = render(<StatusBadge status="delivered" />);

    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Entregado")).toBeVisible();
  });

  it("aplica el tono del estado (pill tintado, no sólido)", () => {
    render(<StatusBadge status="delivered" />);
    // Tint 12% + texto foreground: contraste AA en light y dark.
    expect(screen.getByText("Entregado")).toHaveClass("bg-success/12");
  });

  it("permite override del texto conservando el tono (rechazo con taller)", () => {
    render(
      <StatusBadge status="rejected" label="Rechazado por Lubricentro Central" />,
    );

    const badge = screen.getByText("Rechazado por Lubricentro Central");
    expect(badge).toHaveClass("bg-destructive/10");
  });

  it("hideIcon deja el texto como única señal", () => {
    const { container } = render(<StatusBadge status="open" hideIcon />);

    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Abierto")).toBeInTheDocument();
  });
});

describe("InfoField / InfoGrid", () => {
  it("renderiza la etiqueta con su icono y el valor debajo", () => {
    const { container } = render(
      <InfoGrid>
        <InfoField
          icon={Gauge}
          label="Kilometraje"
          value="68.500 km"
          valueClassName="font-mono"
        />
        <InfoField icon={Wrench} label="Taller" value="Lubricentro Central" />
      </InfoGrid>,
    );

    const label = screen.getByText("Kilometraje");
    const value = screen.getByText("68.500 km");

    expect(label).toBeInTheDocument();
    expect(value).toBeInTheDocument();
    expect(value).toHaveClass("font-mono");

    // La etiqueta precede al valor en el DOM (orden de lectura natural).
    expect(
      label.compareDocumentPosition(value) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Iconos decorativos: no se anuncian.
    for (const icon of Array.from(container.querySelectorAll("svg"))) {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });
});

describe("SectionHeader", () => {
  it("incluye el contador dentro del heading (nombre accesible completo)", () => {
    render(
      <SectionHeader title="Evidencias" count="2 archivos" as="h2" />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: /evidencias/i }),
    ).toHaveTextContent("2 archivos");
  });

  it("respeta el nivel de heading pedido (secciones dentro de tarjeta)", () => {
    render(<SectionHeader title="General" count="2 fotografías" as="h3" />);

    expect(
      screen.getByRole("heading", { level: 3, name: /general/i }),
    ).toBeInTheDocument();
  });
});

describe("PageHeader / PageTitle", () => {
  it("compone navegación de retorno, h1, metadatos y acciones", () => {
    render(
      <PageHeader back={<BackLink href="/vehicles/v1">Volver al vehículo</BackLink>}>
        <PageTitle
          title="Cambio de aceite"
          meta="ABC123 · Toyota Corolla"
          actions={<StatusBadge status="delivered" />}
        />
      </PageHeader>,
    );

    const back = screen.getByRole("link", { name: "Volver al vehículo" });
    expect(back).toHaveAttribute("href", "/vehicles/v1");

    expect(
      screen.getByRole("heading", { level: 1, name: "Cambio de aceite" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ABC123 · Toyota Corolla")).toBeInTheDocument();
    expect(screen.getByText("Entregado")).toBeInTheDocument();
  });

  it("BackLink mantiene el área táctil mínima de 44px", () => {
    render(<BackLink href="/vehicles">Volver</BackLink>);

    expect(screen.getByRole("link", { name: "Volver" })).toHaveClass("min-h-11");
  });
});

describe("InfoCard", () => {
  it("renderiza header estándar y contenido", () => {
    render(
      <InfoCard title="Evidencias" count="2 archivos" description="Fotos del servicio">
        <p>Contenido</p>
      </InfoCard>,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: /evidencias/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fotos del servicio")).toBeInTheDocument();
    expect(screen.getByText("Contenido")).toBeInTheDocument();
  });

  it("acepta un header libre sin duplicar títulos", () => {
    render(
      <InfoCard header={<PageTitle title="Cambio de aceite" />}>
        <p>Contenido</p>
      </InfoCard>,
    );

    expect(
      screen.getAllByRole("heading", { level: 1, name: "Cambio de aceite" }),
    ).toHaveLength(1);
  });
});

describe("PrimaryButton", () => {
  it("es un botón primario de 44px con su nombre accesible", () => {
    render(<PrimaryButton onClick={() => {}}>Reintentar</PrimaryButton>);

    const button = screen.getByRole("button", { name: "Reintentar" });
    expect(button).toHaveClass("h-11");
  });
});

describe("EmptyState", () => {
  it("variante compact mantiene título y descripción, con icono decorativo", () => {
    const { container } = render(
      <EmptyState
        compact
        icon={Wrench}
        title="Sin imágenes de evidencia"
        description="Van a aparecer acá."
      />,
    );

    expect(screen.getByText("Sin imágenes de evidencia")).toBeInTheDocument();
    expect(screen.getByText("Van a aparecer acá.")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
