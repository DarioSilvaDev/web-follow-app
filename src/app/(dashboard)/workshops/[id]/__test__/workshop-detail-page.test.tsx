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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const mockListEpisodes = vi.fn();
const mockGetVerifications = vi.fn();
const mockListPhotos = vi.fn();

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
  careEpisodeApi: {
    listCareEpisodes: (args: unknown) => mockListEpisodes(args),
    getCareEpisodeVerifications: () => mockGetVerifications(),
  },
  vehicleApi: {
    listPhotos: (vehicleId: string) => mockListPhotos(vehicleId),
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "w1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
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

// El checklist de onboarding del Resumen consume este contexto; en este test
// solo interesa el listado de atenciones, así que se provee un stub estable.
vi.mock("@/components/onboarding/onboarding-tour-provider", () => ({
  useOnboardingTour: () => ({
    isTourVisible: false,
    showTour: vi.fn(),
    hideTour: vi.fn(),
  }),
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

/** Item del listado con la miniatura aditiva D-213 (o sin ella). */
function makeEpisodeItem(
  primaryPhoto?: { url: string; expiresAt: string } | null,
) {
  return {
    id: "e1",
    vehicleId: "v1",
    title: "Cambio de aceite",
    status: "delivered" as const,
    source: "workshop" as const,
    verification: null,
    canonicalDate: "2026-11-26T12:00:00.000Z",
    canonicalDateOnly: "2026-11-26",
    mileageIn: 120000,
    vehicle: {
      licensePlate: "AB123CD",
      brand: "Ford",
      model: "Mustang",
      manufactureYear: 2020,
      ...(primaryPhoto !== undefined ? { primaryPhoto } : {}),
    },
  };
}

function mockEpisodesWith(primaryPhoto?: { url: string; expiresAt: string } | null) {
  mockListEpisodes.mockResolvedValue({
    data: [makeEpisodeItem(primaryPhoto)],
    meta: { total: 1, page: 1, limit: 5, totalPages: 1 },
  });
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
  // El tab Resumen es el default: siempre monta el overview y consulta estos
  // endpoints. Defaults vacíos para que los tests no dependan de ellos.
  mockListEpisodes.mockResolvedValue({
    data: [],
    meta: { total: 0, page: 1, limit: 5, totalPages: 0 },
  });
  mockGetVerifications.mockResolvedValue([]);
  mockListPhotos.mockResolvedValue([]);
});

describe("WorkshopDetailPage — tab Resumen (default)", () => {
  it("abre en Resumen y muestra el estado vacío de atenciones", async () => {
    mockGetWorkshop.mockResolvedValue(workshop);
    mockListSpecialties.mockResolvedValue([]);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Taller Centro" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Resumen" })).toBeInTheDocument();
    expect(await screen.findByText("Atenciones recientes")).toBeInTheDocument();
    expect(
      await screen.findByText("Todavía no hay atenciones registradas"),
    ).toBeInTheDocument();
    expect(screen.getByText("Primeros pasos del taller")).toBeInTheDocument();
    expect(screen.getByTestId("workshop-overview-grid").className).toContain(
      "lg:grid-cols-[minmax(0,2.2fr)",
    );
  });

  it("con el checklist completo oculta 'Primeros pasos' y la tabla ocupa todo el ancho", async () => {
    mockGetWorkshop.mockResolvedValue({
      ...workshop,
      legalName: "Taller Centro SRL",
      taxId: "30-12345678-9",
      email: "taller@example.com",
      phone: "3511234567",
      description: "Taller de autos",
      branches: [
        {
          id: "b1",
          workshopId: "w1",
          name: "Sede",
          phone: null,
          email: null,
          street: null,
          streetNumber: null,
          city: null,
          state: null,
          country: null,
          postalCode: null,
          isHeadquarters: true,
          isActive: true,
        },
      ],
    });
    mockListSpecialties.mockResolvedValue([frenos]);
    mockEpisodesWith();

    renderPage();

    expect(await screen.findByText("Atenciones recientes")).toBeInTheDocument();
    // El checklist se deriva de queries: mientras cargan se muestra, y se
    // oculta cuando el estado real ya está completo.
    await waitFor(() => {
      expect(
        screen.queryByText("Primeros pasos del taller"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("workshop-overview-grid").className).not.toContain(
      "lg:grid-cols-[",
    );
  });

  it("lista las atenciones recientes con patente y estado", async () => {
    mockGetWorkshop.mockResolvedValue(workshop);
    mockListSpecialties.mockResolvedValue([]);
    mockListEpisodes.mockResolvedValue({
      data: [
        {
          id: "e1",
          vehicleId: "v1",
          title: "Cambio de aceite",
          status: "open",
          source: "workshop",
          verification: null,
          canonicalDate: "2026-11-20T12:00:00.000Z",
          canonicalDateOnly: "2026-11-20",
          mileageIn: 120000,
          vehicle: {
            licensePlate: "AB123CD",
            brand: "Toyota",
            model: "Corolla",
            manufactureYear: 2019,
          },
        },
      ],
      meta: { total: 1, page: 1, limit: 5, totalPages: 1 },
    });
    renderPage();

    expect(await screen.findByText(/AB123CD/)).toBeInTheDocument();
    expect(screen.getByText("Cambio de aceite")).toBeInTheDocument();
    // D-213: se pide el campo aditivo de la miniatura en el mismo listado.
    expect(mockListEpisodes).toHaveBeenCalledWith({
      page: 1,
      limit: 5,
      signed: true,
    });
  });

  it("muestra la foto principal del vehículo como miniatura cuando existe (D-213)", async () => {
    mockGetWorkshop.mockResolvedValue(workshop);
    mockListSpecialties.mockResolvedValue([]);
    mockEpisodesWith({
      url: "https://signed.example/principal.webp",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    const { container } = renderPage();

    expect(await screen.findByText(/AB123CD/)).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector("img")).toHaveAttribute(
        "src",
        "https://signed.example/principal.webp",
      );
    });
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    // D-024 A1.4: /vehicles/:id/photos sigue en modo estricto (403 en el
    // taller). La miniatura debe venir del listado, sin request extra.
    expect(mockListPhotos).not.toHaveBeenCalled();
  });

  it("mantiene el placeholder cuando no hay foto o la URL está vencida", async () => {
    mockGetWorkshop.mockResolvedValue(workshop);
    mockListSpecialties.mockResolvedValue([]);
    mockEpisodesWith({
      url: "https://signed.example/vencida.webp",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    const { container } = renderPage();
    await screen.findByText(/AB123CD/);

    expect(container.querySelector("img")).toBeNull();
    expect(mockListPhotos).not.toHaveBeenCalled();
  });

  it("mantiene el placeholder cuando el vehículo no tiene fotos", async () => {
    mockGetWorkshop.mockResolvedValue(workshop);
    mockListSpecialties.mockResolvedValue([]);
    mockEpisodesWith(null);

    const { container } = renderPage();
    await screen.findByText(/AB123CD/);

    expect(container.querySelector("img")).toBeNull();
  });

  it("cae al placeholder si la imagen falla (404/403) sin reintentarla", async () => {
    mockGetWorkshop.mockResolvedValue(workshop);
    mockListSpecialties.mockResolvedValue([]);
    mockEpisodesWith({
      url: "https://signed.example/rota.webp",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    const { container } = renderPage();
    await screen.findByText(/AB123CD/);
    const image = await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
      return img!;
    });

    fireEvent.error(image);

    await waitFor(() => {
      expect(container.querySelector("img")).toBeNull();
    });
  });
});

describe("WorkshopDetailPage — CTAs del header", () => {
  it("expone los CTAs operativos, incl. Reclamos (F-2)", async () => {
    mockGetWorkshop.mockResolvedValue(workshop);
    mockListSpecialties.mockResolvedValue([]);
    renderPage();

    await screen.findByRole("heading", { name: "Taller Centro" });
    // El CTA del header convive con el del empty state del Resumen.
    const registrarLinks = screen.getAllByRole("link", {
      name: "Registrar servicio",
    });
    expect(
      registrarLinks.some(
        (link) => link.getAttribute("href") === "/atenciones/nueva",
      ),
    ).toBe(true);
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

  it("el menú secundario mobile no queda recortado por el Card del header", async () => {
    mockGetWorkshop.mockResolvedValue(workshop);
    mockListSpecialties.mockResolvedValue([]);
    renderPage();

    await screen.findByRole("heading", { name: "Taller Centro" });

    const trigger = screen.getByRole("button", { name: "Más acciones" });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    // El menú se posiciona con `absolute top-full` dentro del header: si el
    // Card conserva su `overflow-hidden` default, las opciones se recortan.
    const menu = trigger.nextElementSibling as HTMLElement | null;
    expect(menu?.className).toContain("absolute");
    const card = menu?.closest('[data-slot="card"]') as HTMLElement | null;
    expect(card?.className).toContain("overflow-visible");
    expect(card?.className).not.toContain("overflow-hidden");
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
