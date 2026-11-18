/**
 * Tests de WorkshopSpecialtiesSection — pestaña "Especialidades" de "Mi taller".
 *
 * Cubre:
 * - Lectura: loading, chips de lo cargado y error de listado con reintento.
 * - Estado vacío coherente con el aviso del check-in ("Cargalas en Mi taller").
 * - Alta: selector con búsqueda → selección múltiple → POST por especialidad →
 *   invalidación de `["workshop-specialties"]` Y de
 *   `["care-episode-service-types"]` (el catálogo del check-in se deriva de
 *   estas filas) → banner de éxito.
 * - Baja desde el chip → DELETE → banner de éxito.
 * - Permisos: sin `workshop.specialties.manage` hay lectura + texto de ayuda,
 *   sin controles de gestión (PROD-003: señalizar, no ocultar).
 * - 403 en runtime → copy mapeado por `workshop-errors.ts`, nunca texto crudo
 *   (FR-007), y la sección queda en modo lectura.
 *
 * El gate de permisos se resuelve con `canInWorkshop` sobre
 * `workshopMemberships[].role.permissions` (contrato real de `/auth/me`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { WorkshopSpecialtiesSection } from "@/components/workshop/workshop-specialties-section";
import type { SessionUser } from "@/types/auth";
import type { WorkshopDetail, WorkshopSpecialty } from "@/types/workshop";

const mockListSpecialties = vi.fn();
const mockListCatalog = vi.fn();
const mockAddSpecialty = vi.fn();
const mockRemoveSpecialty = vi.fn();

// La session se setea por test antes de renderizar; los factories de
// `vi.mock` solo cierran sobre estas variables (se leen al renderizar).
let mockUser: SessionUser | null = null;

vi.mock("@/lib/api", () => ({
  workshopApi: {
    listSpecialties: (workshopId: string) => mockListSpecialties(workshopId),
    listSpecialtyCatalog: () => mockListCatalog(),
    addSpecialty: (workshopId: string, specialtyId: string) =>
      mockAddSpecialty(workshopId, specialtyId),
    removeSpecialty: (workshopId: string, specialtyId: string) =>
      mockRemoveSpecialty(workshopId, specialtyId),
  },
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

const alineacion: WorkshopSpecialty = {
  id: "s2",
  code: "ALI",
  name: "Alineación",
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

function renderSection(
  user: SessionUser | null = makeUser(["workshop.specialties.manage"]),
) {
  mockUser = user;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Semilla de la query del check-in: el componente debe invalidarla con
  // prefijo ["care-episode-service-types"] para que /atenciones/nueva
  // refleje el cambio.
  queryClient.setQueryData(["care-episode-service-types", "w1"], {
    data: [],
    onboardingRequired: true,
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <WorkshopSpecialtiesSection workshop={workshop} />
    </QueryClientProvider>,
  );
  return { queryClient, ...view };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("WorkshopSpecialtiesSection", () => {
  it("muestra estado de carga mientras se leen las especialidades", () => {
    mockListSpecialties.mockReturnValue(new Promise(() => {}));
    renderSection();

    expect(screen.getByRole("status")).toHaveTextContent(
      /cargando especialidades/i,
    );
  });

  it("lista las especialidades cargadas como chips con opción de quitar", async () => {
    mockListSpecialties.mockResolvedValue([frenos, alineacion]);
    renderSection();

    expect(await screen.findByText("Frenos")).toBeInTheDocument();
    expect(screen.getByText("Alineación")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Quitar Frenos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Quitar Alineación" }),
    ).toBeInTheDocument();
  });

  it("estado vacío: invita a cargar y explica el efecto en el check-in", async () => {
    mockListSpecialties.mockResolvedValue([]);
    renderSection();

    expect(
      await screen.findByText(/todavía no cargaste especialidades/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/el check-in muestra todos los tipos de atención/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /agregar la primera especialidad/i }),
    ).toBeInTheDocument();
  });

  it("alta: búsqueda + multiselect → POST → invalida check-in → éxito", async () => {
    // Primera carga vacía; tras la invalidación, la lista vuelve con el alta.
    mockListSpecialties.mockResolvedValueOnce([]).mockResolvedValue([frenos]);
    mockListCatalog.mockResolvedValue([frenos, alineacion]);
    mockAddSpecialty.mockResolvedValue(frenos);
    const { queryClient } = renderSection();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: /agregar la primera especialidad/i }),
    );

    // Búsqueda sobre el catálogo público.
    await user.type(await screen.findByLabelText(/buscar/i), "fren");
    expect(await screen.findByRole("button", { name: "Frenos" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Alineación" }),
    ).not.toBeInTheDocument();

    // Selección múltiple (multiselect del plan) + alta por POST individual.
    await user.click(screen.getByRole("button", { name: "Frenos" }));
    expect(screen.getByRole("button", { name: "Frenos" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: /añadir \(1\)/i }));

    await waitFor(() =>
      expect(mockAddSpecialty).toHaveBeenCalledWith("w1", "s1"),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      /se agregó la especialidad/i,
    );
    // La lista se refresca con el chip cargado y el check-in queda invalidado.
    expect(
      await screen.findByRole("button", { name: "Quitar Frenos" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        queryClient.getQueryState(["care-episode-service-types", "w1"])
          ?.isInvalidated,
      ).toBe(true);
    });
  });

  it("baja: quitar desde el chip → DELETE → éxito", async () => {
    mockListSpecialties.mockResolvedValue([frenos]);
    mockRemoveSpecialty.mockResolvedValue(undefined);
    renderSection();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Quitar Frenos" }),
    );

    await waitFor(() =>
      expect(mockRemoveSpecialty).toHaveBeenCalledWith("w1", "s1"),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Se quitó Frenos.",
    );
  });

  it("sin permiso: ve las especialidades pero no los controles de gestión", async () => {
    mockListSpecialties.mockResolvedValue([frenos]);
    renderSection(makeUser([]));

    // Lectura para todo miembro (PROD-003).
    expect(await screen.findByText("Frenos")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar Frenos" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /añadir especialidad/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /agregar la primera especialidad/i }),
    ).not.toBeInTheDocument();
    // Texto de ayuda en lugar de ocultar la sección.
    expect(
      screen.getByText(/necesitás permiso de administrador del taller/i),
    ).toBeInTheDocument();
    // Sin permiso ni picker abierto: el catálogo no se pide.
    expect(mockListCatalog).not.toHaveBeenCalled();
  });

  it("403 en runtime → copy mapeado (nunca texto crudo) y modo lectura", async () => {
    mockListSpecialties.mockResolvedValue([frenos]);
    mockRemoveSpecialty.mockRejectedValue({
      status: 403,
      message: "ForbiddenException: role lacks workshop.specialties.manage",
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Quitar Frenos" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Necesitás permiso de administrador del taller para gestionar las especialidades.",
    );
    expect(alert).not.toHaveTextContent(/ForbiddenException/);
    // PROD-003: queda en modo lectura con el motivo, sin controles.
    expect(
      screen.queryByRole("button", { name: "Quitar Frenos" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/necesitás permiso de administrador del taller/i)
        .length,
    ).toBeGreaterThan(0);
  });

  it("error de listado → copy mapeado + Reintentar recarga", async () => {
    mockListSpecialties
      .mockRejectedValueOnce({ status: 500, message: "boom" })
      .mockResolvedValue([frenos]);
    renderSection();
    const user = userEvent.setup();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/error interno del servidor/i);
    expect(alert).not.toHaveTextContent("boom");

    await user.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(
      await screen.findByRole("button", { name: "Quitar Frenos" }),
    ).toBeInTheDocument();
  });
});
