/**
 * Dashboard layout header — nav y chip de contexto activo.
 *
 * Ajustado al cambio de navegación/contexto (reemplazo del ContextSelector):
 * - Nav: Inicio · Transferencias · Concesionarias · Talleres ·
 *   Administración · Mi perfil. Sin items de Atenciones (F-023: son quick
 *   actions del dashboard).
 * - "Talleres" solo con `workshopMemberships`; "Concesionarias" solo con
 *   `dealershipMemberships`.
 * - El chip de contexto (ContextChip) se renderiza con contexto activo y
 *   no renderiza en PERSONAL.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  clearActiveContext,
  clearWorkshop,
  selectWorkshop,
} from "@/lib/active-context";

const mockPush = vi.fn();
const mockClearSession = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockPush,
  }),
  usePathname: () => "/dashboard",
}));

// Usuario configurable para variar membresías entre tests.
let mockUser: Record<string, unknown> | null;

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: mockUser,
    clearSession: (...args: unknown[]) => mockClearSession(...args),
  }),
}));

const mockLogout = vi.fn();

vi.mock("@/lib/api", () => ({
  authApi: {
    logout: (...args: unknown[]) => mockLogout(...args),
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

let DashboardLayout: React.ComponentType<{ children: React.ReactNode }>;

function makeUser(
  overrides: {
    workshopMemberships?: unknown[];
    dealershipMemberships?: unknown[];
  } = {},
) {
  return {
    id: "u1",
    firstName: "Juan",
    lastName: "Perez",
    workshopMemberships: [],
    dealershipMemberships: [],
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  clearActiveContext();
  clearWorkshop();
  mockUser = makeUser({
    workshopMemberships: [
      {
        workshopId: "w1",
        workshop: { id: "w1", name: "Lubricentro Central" },
        role: "Owner",
      },
    ],
  });
  const mod = await import("@/app/(dashboard)/layout");
  DashboardLayout = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
  clearActiveContext();
  clearWorkshop();
  mockUser = null;
});

function renderLayout() {
  return render(
    <DashboardLayout>
      <p>contenido</p>
    </DashboardLayout>,
  );
}

describe("Dashboard header nav (nuevo orden, sin Atenciones)", () => {
  it("con membresía de taller muestra 'Talleres' (→ /workshops) y NUNCA items de atenciones", async () => {
    renderLayout();

    const talleres = screen.getByRole("link", { name: "Talleres" });
    expect(talleres).toHaveAttribute("href", "/workshops");

    // F-023: Atenciones / Nueva atención / Verificaciones NO son items de nav.
    expect(
      screen.queryByRole("link", { name: "Atenciones" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Nueva atención" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Verificaciones" }),
    ).not.toBeInTheDocument();
  });

  it("sin membresías de taller ni concesionaria NO muestra 'Talleres' ni 'Concesionarias'", async () => {
    mockUser = makeUser();
    renderLayout();

    expect(
      screen.queryByRole("link", { name: "Talleres" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Concesionarias" }),
    ).not.toBeInTheDocument();

    // Links permanentes intactos (incl. Fase 1: "Transferencias" en base).
    expect(screen.getByRole("link", { name: "Autentia" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Mi perfil" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByRole("link", { name: "Transferencias" })).toHaveAttribute(
      "href",
      "/transferencias",
    );
  });

  it("con membresía de concesionaria muestra 'Concesionarias' (→ /dealerships)", async () => {
    mockUser = makeUser({
      dealershipMemberships: [
        {
          dealershipId: "d1",
          dealershipName: "Autos del Sur",
          role: { id: "r1", code: "owner", name: "Dueño" },
        },
      ],
    });
    renderLayout();

    expect(screen.getByRole("link", { name: "Concesionarias" })).toHaveAttribute(
      "href",
      "/dealerships",
    );
  });

  it("marca aria-current='page' en el item activo (/dashboard = Inicio)", async () => {
    renderLayout();

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Transferencias" }),
    ).not.toHaveAttribute("aria-current");
  });
});

// ── ContextChip (reemplaza al ContextSelector) ──────────────────────────────

describe("ContextChip en el header", () => {
  it("con contexto WORKSHOP activo muestra el chip con el nombre del taller", async () => {
    selectWorkshop("w1");
    renderLayout();

    // El chip renderiza en ambos headers (desktop + mobile) en el DOM.
    const chips = screen.getAllByTestId("context-chip");
    expect(chips.length).toBeGreaterThanOrEqual(1);
    expect(chips[0]).toHaveTextContent("Taller: Lubricentro Central");
  });

  it("sin contexto activo (PERSONAL) no renderiza el chip", async () => {
    renderLayout();

    expect(screen.queryByTestId("context-chip")).not.toBeInTheDocument();
  });
});

// ── Fase 1 / D-078: "Transferencias" es un link BASE (todos los contextos) ──

describe("Dashboard header — link Transferencias (Fase 1 / D-078)", () => {
  it("se muestra en contexto PERSONAL apuntando al panel", async () => {
    renderLayout();

    const link = screen.getByRole("link", { name: "Transferencias" });
    expect(link).toHaveAttribute("href", "/transferencias");
  });

  it("se muestra también con taller seleccionado (WORKSHOP)", async () => {
    selectWorkshop("w1");
    renderLayout();

    expect(screen.getByRole("link", { name: "Transferencias" })).toHaveAttribute(
      "href",
      "/transferencias",
    );
  });
});
