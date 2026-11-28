/**
 * Tests for the "Atenciones" page (F-023, listado del taller).
 *
 * Comportamientos críticos:
 * - WORKSHOP-only: sin taller seleccionado solo orienta (el GET no corre).
 * - GET /care-episodes → listado paginado del taller del contexto activo.
 * - Episodio owner `verification='rejected'` → badge "Rechazado"
 *   (destructive) y NUNCA "Registrado por el propietario" (rechazo de
 *   verificación, diseño aprobado).
 * - Episodio owner `unverified` → "Registrado por el propietario";
 *   `verified` → "Verificado".
 * - Deep-link al detalle `/vehicles/:id/servicios/:id`.
 * - F-023 / D-F023-1a: búsqueda por patente — debounce 300ms, query
 *   efectiva ≥2 caracteres, `q` en la llamada al API, reset de página,
 *   empty state de búsqueda + "Limpiar búsqueda" y Escape para limpiar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearWorkshop, selectWorkshop } from "@/lib/active-context";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockListCareEpisodes = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// El Link real necesita router context → mock funcional (patrón del repo).
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api", () => ({
  careEpisodeApi: {
    listCareEpisodes: (...args: unknown[]) => mockListCareEpisodes(...args),
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "u1",
      workshopMemberships: [
        {
          workshopId: "w1",
          workshop: { id: "w1", name: "Lubricentro Central" },
          role: "Owner",
        },
      ],
    },
  }),
}));

// Mock UI components to avoid deep dependency trees (existing convention)
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
  buttonVariants: () => "",
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
}));
// La barra de búsqueda usa Input + Label — mockearlos mantiene el árbol
// poco profundo (mismo patrón que vehicles-page.test.tsx).
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: (props: React.ComponentProps<"label">) => <label {...props} />,
}));
// Paginación mockeada como botones para poder ir a página 2 en tests.
vi.mock("@/components/admin/admin-table-pagination", () => ({
  AdminTablePagination: ({
    page,
    onPageChange,
  }: {
    page: number;
    onPageChange: (next: number) => void;
  }) => (
    <button type="button" onClick={() => onPageChange(page + 1)}>
      Ir a página {page + 1}
    </button>
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeListItem(
  overrides: Partial<import("@/types/care-episode").CareEpisodeListItem> = {},
): import("@/types/care-episode").CareEpisodeListItem {
  return {
    id: "e1",
    vehicleId: "v1",
    title: "Cambio de aceite",
    status: "delivered",
    source: "owner",
    verification: "unverified",
    canonicalDate: "2026-06-15T00:00:00.000Z",
    canonicalDateOnly: "2026-06-15",
    mileageIn: 18500,
    vehicle: {
      licensePlate: "ABC123",
      brand: "Chevrolet",
      model: "Onix",
      manufactureYear: 2024,
    },
    ...overrides,
  };
}

function listResponse(items: ReturnType<typeof makeListItem>[]) {
  return {
    data: items,
    meta: { total: items.length, page: 1, limit: 20, totalPages: 1 },
  };
}

let AtencionesPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  clearWorkshop();
  const mod = await import("@/app/(dashboard)/atenciones/page");
  AtencionesPage = mod.default;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearWorkshop();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AtencionesPage />
    </QueryClientProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Atenciones page (F-023)", () => {
  it("sin taller seleccionado muestra la guía y NO ejecuta el GET (WORKSHOP-only)", async () => {
    renderPage();

    expect(
      await screen.findByText(/necesitás operar en el contexto de un taller/i),
    ).toBeInTheDocument();
    expect(mockListCareEpisodes).not.toHaveBeenCalled();
    // El nav global (drawer/sidebar) reemplaza al back link del header.
    expect(
      screen.queryByRole("link", { name: "Volver al inicio" }),
    ).not.toBeInTheDocument();
  });

  it("episodio rechazado → badge 'Rechazado' (destructive), NUNCA 'Registrado por el propietario'", async () => {
    mockListCareEpisodes.mockResolvedValue(
      listResponse([makeListItem({ verification: "rejected" })]),
    );
    selectWorkshop("w1");

    renderPage();

    const badge = await screen.findByText("Rechazado");
    expect(badge).toBeInTheDocument();
    // Pill tintado del DS: el tono destructivo ahora es `bg-destructive/10`
    // (fondo al 10% + texto en primer plano) para alcanzar contraste AA.
    expect(badge).toHaveClass("bg-destructive/10");
    expect(
      screen.queryByText("Registrado por el propietario"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Verificado")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Volver al inicio" }),
    ).not.toBeInTheDocument();
  });

  it("episodio sin verificar / verificado mantienen su copy existente", async () => {
    mockListCareEpisodes.mockResolvedValue(
      listResponse([
        makeListItem({ id: "e1", verification: "unverified" }),
        makeListItem({ id: "e2", verification: "verified" }),
      ]),
    );
    selectWorkshop("w1");

    renderPage();

    expect(
      await screen.findByText("Registrado por el propietario"),
    ).toBeInTheDocument();
    expect(screen.getByText("Verificado")).toBeInTheDocument();
    expect(screen.queryByText("Rechazado")).not.toBeInTheDocument();
  });

  it("usa la misma tabla de 4 columnas que 'Atenciones recientes' y conserva km + verificación", async () => {
    mockListCareEpisodes.mockResolvedValue(listResponse([makeListItem()]));
    selectWorkshop("w1");

    renderPage();

    expect(await screen.findByText("Cambio de aceite")).toBeInTheDocument();
    expect(screen.getByText("Vehículo")).toBeInTheDocument();
    expect(screen.getByText("Servicio")).toBeInTheDocument();
    expect(screen.getByText("Estado")).toBeInTheDocument();
    expect(screen.getByText("Fecha")).toBeInTheDocument();
    expect(screen.getByText("18.500 km")).toBeInTheDocument();
    expect(
      screen.getByText("Registrado por el propietario"),
    ).toBeInTheDocument();
    expect(screen.getByText("ABC123")).toBeInTheDocument();
  });

  it("cada fila linkea al detalle del episodio", async () => {
    mockListCareEpisodes.mockResolvedValue(listResponse([makeListItem()]));
    selectWorkshop("w1");

    renderPage();

    expect(await screen.findByText("Cambio de aceite")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /cambio de aceite/i }),
    ).toHaveAttribute("href", "/vehicles/v1/servicios/e1");
    expect(mockListCareEpisodes).toHaveBeenCalledTimes(1);
  });
});

// ── F-023 / D-F023-1a: search by patente ────────────────────────────────────

const DEBOUNCE_MS = 300;

/**
 * Flush fake timers + microtasks inside act (la debounce usa un setTimeout
 * de 300ms; React Query notifica con setTimeout(0) y resuelve en microtareas).
 */
async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      await Promise.resolve();
    });
  }
}

function searchInput() {
  // Por rol, no por placeholder: el copy del placeholder puede cambiar sin
  // que eso altere el contrato del buscador (D-F023-1a).
  return screen.getByRole("searchbox");
}

describe("Atenciones page — search (D-F023-1a)", () => {
  it("escribe 'SMK' → tras el debounce, listCareEpisodes se llama con { page: 1, limit: 20, q: 'SMK' }", async () => {
    vi.useFakeTimers();
    mockListCareEpisodes.mockResolvedValue(listResponse([makeListItem()]));
    selectWorkshop("w1");

    renderPage();
    await settle();

    fireEvent.change(searchInput(), { target: { value: "SMK" } });
    await settle();

    expect(mockListCareEpisodes).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: "SMK",
      signed: true,
    });
  });

  it("formatea mientras se escribe: 3.er carácter dígito → AA111AA", async () => {
    vi.useFakeTimers();
    mockListCareEpisodes.mockResolvedValue(listResponse([makeListItem()]));
    selectWorkshop("w1");

    renderPage();
    await settle();

    fireEvent.change(searchInput(), { target: { value: "fk123ab" } });
    expect(searchInput()).toHaveValue("FK123AB");
    await settle();

    expect(mockListCareEpisodes).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: "FK123AB",
      signed: true,
    });
  });

  it("formatea mientras se escribe: 3.er carácter letra → AAA111", async () => {
    vi.useFakeTimers();
    mockListCareEpisodes.mockResolvedValue(listResponse([makeListItem()]));
    selectWorkshop("w1");

    renderPage();
    await settle();

    fireEvent.change(searchInput(), { target: { value: "fka123" } });
    expect(searchInput()).toHaveValue("FKA123");
    await settle();

    expect(mockListCareEpisodes).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: "FKA123",
      signed: true,
    });
  });

  it("no muestra el hint 'Patente vieja / patente nueva'", async () => {
    vi.useFakeTimers();
    mockListCareEpisodes.mockResolvedValue(listResponse([makeListItem()]));
    selectWorkshop("w1");

    renderPage();
    await settle();

    expect(screen.queryByText(/Patente vieja/)).not.toBeInTheDocument();
    expect(screen.queryByText(/patente nueva/)).not.toBeInTheDocument();
  });

  it("con 1 carácter NO filtra: la llamada sale sin `q`", async () => {
    vi.useFakeTimers();
    mockListCareEpisodes.mockResolvedValue(listResponse([makeListItem()]));
    selectWorkshop("w1");

    renderPage();
    await settle();

    fireEvent.change(searchInput(), { target: { value: "S" } });
    await settle();

    expect(mockListCareEpisodes).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      signed: true,
    });
    expect(mockListCareEpisodes).not.toHaveBeenCalledWith(
      expect.objectContaining({ q: expect.anything() }),
    );
  });

  it("búsqueda sin resultados → EmptyState específico y 'Limpiar búsqueda' restaura el listado completo", async () => {
    vi.useFakeTimers();
    mockListCareEpisodes.mockImplementation(({ q }: { q?: string } = {}) => {
      if (q) {
        return Promise.resolve({
          data: [],
          meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
        });
      }
      return Promise.resolve(
        listResponse([
          makeListItem({ id: "e1" }),
          makeListItem({ id: "e2", vehicleId: "v2" }),
        ]),
      );
    });
    selectWorkshop("w1");

    renderPage();
    await settle();
    expect(screen.getAllByText("Cambio de aceite")).toHaveLength(2);

    fireEvent.change(searchInput(), { target: { value: "ZZZ999" } });
    await settle();

    expect(
      screen.getByText("No se encontraron atenciones con esa patente"),
    ).toBeInTheDocument();

    // CTA "Limpiar búsqueda" es el botón con texto (el X del input es solo icono).
    const clearCta = screen
      .getAllByRole("button", { name: /limpiar búsqueda/i })
      .find((b) => b.textContent?.includes("Limpiar búsqueda"));
    expect(clearCta).toBeDefined();
    fireEvent.click(clearCta!);
    await settle();

    expect(screen.getAllByText("Cambio de aceite")).toHaveLength(2);
    expect(mockListCareEpisodes).toHaveBeenLastCalledWith({
      page: 1,
      limit: 20,
      signed: true,
    });
  });

  it("escribe en la búsqueda estando en página 2 → vuelve a página 1 con `q`", async () => {
    vi.useFakeTimers();
    mockListCareEpisodes.mockImplementation(
      ({ page = 1 }: { page?: number } = {}) =>
        Promise.resolve({
          data: [makeListItem()],
          meta: { total: 40, page, limit: 20, totalPages: 2 },
        }),
    );
    selectWorkshop("w1");

    renderPage();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: /ir a página 2/i }));
    await settle();

    expect(mockListCareEpisodes).toHaveBeenLastCalledWith({
      page: 2,
      limit: 20,
      signed: true,
    });

    fireEvent.change(searchInput(), { target: { value: "SMK" } });
    await settle();

    expect(mockListCareEpisodes).toHaveBeenLastCalledWith({
      page: 1,
      limit: 20,
      q: "SMK",
      signed: true,
    });
  });

  it("Escape en el input limpia la búsqueda", async () => {
    vi.useFakeTimers();
    mockListCareEpisodes.mockResolvedValue(listResponse([makeListItem()]));
    selectWorkshop("w1");

    renderPage();
    await settle();

    fireEvent.change(searchInput(), { target: { value: "SMK" } });
    await settle();
    expect(searchInput()).toHaveValue("SMK");

    fireEvent.keyDown(searchInput(), { key: "Escape" });
    await settle();

    expect(searchInput()).toHaveValue("");
    expect(mockListCareEpisodes).toHaveBeenLastCalledWith({
      page: 1,
      limit: 20,
      signed: true,
    });
  });
});
