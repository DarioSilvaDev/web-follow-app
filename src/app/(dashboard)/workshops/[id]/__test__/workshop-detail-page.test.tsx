/**
 * Tests de la página "Mi taller" (`/workshops/[id]`) — wiring de la pestaña
 * Especialidades (DECISION-REGISTER PROD-001 / PROD-003).
 *
 * El comportimiento fino de la sección (alta, baja, permisos, estados,
 * invalidación del check-in) vive en
 * `src/components/workshop/__test__/workshop-specialties-section.test.tsx`;
 * acá se cubre que la pestaña exista, que la sección se monte al abrirla y
 * que lea `GET /workshops/:id/specialties`. También se verifica que el
 * header exponga los CTAs operativos (incl. `/reclamos`, F-2).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkshopDetailPage from "@/app/(dashboard)/workshops/[id]/page";
import type { SessionUser } from "@/types/auth";
import type { WorkshopDetail, WorkshopSpecialty } from "@/types/workshop";

const mockGetWorkshop = vi.fn();
const mockListSpecialties = vi.fn();
const mockListCatalog = vi.fn();
const mockAddSpecialty = vi.fn();
const mockRemoveSpecialty = vi.fn();

let mockUser: SessionUser | null = null;

vi.mock("@/lib/api", () => ({
  workshopApi: {
    getWorkshop: (id: string) => mockGetWorkshop(id),
    listSpecialties: (id: string) => mockListSpecialties(id),
    listSpecialtyCatalog: () => mockListCatalog(),
    addSpecialty: (id: string, specialtyId: string) =>
      mockAddSpecialty(id, specialtyId),
    removeSpecialty: (id: string, specialtyId: string) =>
      mockRemoveSpecialty(id, specialtyId),
    // Solo se invocan en submit; no se ejercitan en este archivo.
    updateWorkshop: () => Promise.reject(new Error("not used")),
    createBranch: () => Promise.reject(new Error("not used")),
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "w1" }),
}));

// El Link real necesita router context → mock funcional (patrón del repo).
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: mockUser }),
}));

const workshop: WorkshopDetail = {
  id: "w1",
  name: "Taller Centro",
  legalName: null,
  taxId: null,
  email: null,
  phone: null,
  website: null,
  logoUrl: null,
  description: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const frenos: WorkshopSpecialty = {
  id: "s1",
  code: "FRE",
  name: "Frenos",
  description: null,
};

function makeUser(permissions: string[]): SessionUser {
  return {
    id: "u1",
    email: "dueno@taller.com",
    firstName: "Ana",
    lastName: "Pérez",
    alias: null,
    avatarUrl: null,
    language: "es",
    status: "active",
    isVehicleOwner: false,
    phone: null,
    roles: [],
    workshopMemberships: [
      {
        workshopId: "w1",
        workshop: { id: "w1", name: "Taller Centro" },
        role: {
          id: "role-owner",
          code: "owner",
          name: "Owner",
          permissions,
        },
      },
    ],
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkshopDetailPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockUser = makeUser(["workshop.specialties.manage"]);
});

describe("WorkshopDetailPage — CTAs del header", () => {
  it("expone los CTAs operativos, incl. Reclamos (F-2)", async () => {
    mockGetWorkshop.mockResolvedValue(workshop);
    mockListSpecialties.mockResolvedValue([]);
    renderPage();

    expect(
      await screen.findByRole("link", { name: "Registrar servicio" }),
    ).toHaveAttribute("href", "/atenciones/nueva");
    expect(
      screen.getByRole("link", { name: "Ver atenciones" }),
    ).toHaveAttribute("href", "/atenciones");
    expect(
      screen.getByRole("link", { name: "Verificaciones" }),
    ).toHaveAttribute("href", "/atenciones/verificaciones");
    expect(screen.getByRole("link", { name: "Reclamos" })).toHaveAttribute(
      "href",
      "/reclamos",
    );
  });
});

describe("WorkshopDetailPage — pestaña Especialidades", () => {
  it("expone la pestaña y monta la sección con lo cargado", async () => {
    mockGetWorkshop.mockResolvedValue(workshop);
    mockListSpecialties.mockResolvedValue([frenos]);
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Taller Centro" }),
    ).toBeInTheDocument();

    await user.click(
      await screen.findByRole("tab", { name: "Especialidades" }),
    );

    // La sección lee GET /workshops/:id/specialties y muestra el chip.
    expect(
      await screen.findByRole("button", { name: "Quitar Frenos" }),
    ).toBeInTheDocument();
    expect(mockListSpecialties).toHaveBeenCalledWith("w1");
    // El catálogo público solo se pide al abrir el selector, no al montar.
    expect(mockListCatalog).not.toHaveBeenCalled();
  });

  it("sin permiso de gestión: la pestaña se ve pero sin controles de alta", async () => {
    mockGetWorkshop.mockResolvedValue(workshop);
    mockListSpecialties.mockResolvedValue([frenos]);
    mockUser = makeUser([]);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("tab", { name: "Especialidades" }),
    );

    expect(await screen.findByText("Frenos")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Quitar Frenos" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /añadir especialidad/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/necesitás permiso de administrador del taller/i),
    ).toBeInTheDocument();
  });
});
