/**
 * PersonalInfoCard — datos personales (solo lectura) desde la sesión.
 *
 * Fuente única: SessionUser (useAuth). Cubre:
 * - datos poblados (nombre, email, alias, idioma, estado, roles, membresías)
 * - fallback de avatar por iniciales cuando no hay avatarUrl
 * - alias ausente ("Sin alias")
 * - estado de carga (skeleton) y user null (no renderiza)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUseAuth = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockUseAuth(),
}));

// Dynamic import del SUT (tras los mocks)
let PersonalInfoCard: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("@/app/(dashboard)/profile/personal-info-card");
  PersonalInfoCard = mod.PersonalInfoCard;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "juan.perez@example.com",
    firstName: "Juan",
    lastName: "Perez",
    alias: null,
    avatarUrl: null,
    language: "es",
    status: "active",
    isVehicleOwner: true,
    roles: [
      { id: "r1", type: "user", name: "Usuario" },
    ],
    workshopMemberships: [],
    dealershipMemberships: [],
    ...overrides,
  };
}

describe("PersonalInfoCard", () => {
  it("muestra nombre, email, idioma y estado de cuenta", () => {
    mockUseAuth.mockReturnValue({ status: "authenticated", user: makeUser() });

    render(<PersonalInfoCard />);

    expect(screen.getByText("Juan Perez")).toBeInTheDocument();
    expect(screen.getByText("juan.perez@example.com")).toBeInTheDocument();
    expect(screen.getByText("Español")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("muestra el alias con @ cuando existe", () => {
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      user: makeUser({ alias: "juan-2026" }),
    });

    render(<PersonalInfoCard />);

    expect(screen.getByText("@juan-2026")).toBeInTheDocument();
  });

  it("muestra 'Sin alias' cuando no hay alias configurado", () => {
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      user: makeUser({ alias: null }),
    });

    render(<PersonalInfoCard />);

    expect(screen.getByText("Sin alias")).toBeInTheDocument();
  });

  it("muestra los nombres de roles como badges", () => {
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      user: makeUser({
        roles: [
          { id: "r1", type: "user", name: "Usuario" },
          { id: "r2", type: "admin", name: "Admin" },
        ],
      }),
    });

    render(<PersonalInfoCard />);

    expect(screen.getByText("Usuario")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("lista membresías de taller y concesionaria cuando existen", () => {
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      user: makeUser({
        workshopMemberships: [
          {
            workshopId: "w1",
            workshop: { id: "w1", name: "Lubricentro Central" },
            role: { id: "m1", code: "owner", name: "Dueño" },
          },
        ],
        dealershipMemberships: [
          {
            dealershipId: "d1",
            dealershipName: "Concesionaria Norte",
            role: { id: "m2", code: "manager", name: "Gerente" },
          },
        ],
      }),
    });

    render(<PersonalInfoCard />);

    expect(screen.getByText("Lubricentro Central")).toBeInTheDocument();
    expect(screen.getByText("· Dueño")).toBeInTheDocument();
    expect(screen.getByText("Concesionaria Norte")).toBeInTheDocument();
    expect(screen.getByText("· Gerente")).toBeInTheDocument();
  });

  it("usa iniciales cuando no hay avatarUrl", () => {
    mockUseAuth.mockReturnValue({ status: "authenticated", user: makeUser() });

    const { container } = render(<PersonalInfoCard />);

    expect(container.querySelector(".rounded-full")).toHaveTextContent("JP");
  });

  it("muestra el skeleton mientras la sesión carga", () => {
    mockUseAuth.mockReturnValue({ status: "loading", user: null });

    render(<PersonalInfoCard />);

    expect(screen.getByText("Datos personales")).toBeInTheDocument();
    expect(screen.getByText("Cargando tu información…")).toBeInTheDocument();
  });

  it("no renderiza nada cuando user es null", () => {
    mockUseAuth.mockReturnValue({ status: "authenticated", user: null });

    const { container } = render(<PersonalInfoCard />);

    expect(container).toBeEmptyDOMElement();
  });
});
