/**
 * Tests for the "Registrar servicio" page (iteración 2-2, propietario).
 *
 * Critical behaviors (spec 2-2 §5-§9, RF-1/RF-8, D-066):
 * - Happy path taller de la app: búsqueda con debounce → selección →
 *   POST /care-episodes/owner con `workshopId` (NUNCA `workshopName`).
 * - Happy path "Otro taller": texto libre → POST con `workshopName`
 *   (NUNCA `workshopId`).
 * - Fecha futura bloqueada en cliente (el date input no puede pasar de hoy).
 * - Taller no encontrado en la búsqueda → orientación a "Otro taller".
 * - Sin taller seleccionado → el submit se bloquea (XOR).
 * - Errores: 429 + Reintentar, 404, 403, red/5xx.
 * - Éxito → mensaje de confianza "hasta que {taller} lo verifique" + "Registrar otro".
 * - Contexto WORKSHOP activo → guía a volver a "Personal" (RF-1: 403 si no).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearWorkshop, selectWorkshop } from "@/lib/active-context";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockCreateOwner = vi.fn();
const mockCreateOwnerWithFiles = vi.fn();
const mockSearchWorkshops = vi.fn();
const mockListCatalog = vi.fn();

const emptyCatalogPage = {
  data: [],
  meta: { total: 0, page: 1, limit: 4, totalPages: 0 },
};

vi.mock("@/lib/api", () => ({
  careEpisodeApi: {
    createOwnerCareEpisode: (...args: unknown[]) => mockCreateOwner(...args),
    createOwnerCareEpisodeWithFiles: (...args: unknown[]) =>
      mockCreateOwnerWithFiles(...args),
  },
  workshopApi: {
    searchWorkshops: (...args: unknown[]) => mockSearchWorkshops(...args),
    listCatalog: (...args: unknown[]) => mockListCatalog(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "v1" }),
}));

// Debounce identity: evita dependencia de timers en los tests (la UI debouncea
// con useDebounce real; acá testeamos el contrato del endpoint y del form).
vi.mock("@/hooks/use-debounce", () => ({
  useDebounce: (value: string) => value,
}));

// Mock UI components to avoid deep dependency trees (existing convention)
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardFooter: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.ComponentProps<"label">) => (
    <label {...props}>{children}</label>
  ),
}));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.ComponentProps<"textarea">) => (
    <textarea {...props} />
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeWorkshop() {
  return {
    id: "w1",
    name: "Lubricentro Central",
    logoUrl: null,
    city: "Córdoba",
  };
}

function addDaysISO(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() + days);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

let OwnerServiceFormPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  clearWorkshop();
  // Catálogo vacío por defecto: las sugerencias no interfieren con los
  // tests existentes (cada test que las necesita define su propia página).
  mockListCatalog.mockResolvedValue(emptyCatalogPage);
  const mod = await import(
    "@/app/(dashboard)/vehicles/[id]/servicios/nueva/page"
  );
  OwnerServiceFormPage = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
  clearWorkshop();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OwnerServiceFormPage />
    </QueryClientProvider>,
  );
}

async function fillServiceForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { title?: string; date?: string } = {},
) {
  const title = overrides.title ?? "Cambio de aceite";
  const date = overrides.date ?? "2026-06-15";
  await user.type(screen.getByLabelText(/título del servicio/i), title);
  fireEvent.change(screen.getByLabelText(/fecha del servicio/i), {
    target: { value: date },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Registrar servicio page (iteración 2-2)", () => {
  it("con contexto WORKSHOP el back-link va a /atenciones (Volver a atenciones)", async () => {
    selectWorkshop("w1");
    renderPage();

    const back = await screen.findByRole("link", {
      name: "Volver a atenciones",
    });
    expect(back).toHaveAttribute("href", "/atenciones");
    expect(
      screen.queryByRole("link", { name: /volver al vehículo/i }),
    ).not.toBeInTheDocument();
  });

  it("en PERSONAL (sin taller) el back-link conserva /vehicles/:id (Volver al vehículo)", async () => {
    renderPage();

    const back = await screen.findByRole("link", {
      name: "Volver al vehículo",
    });
    expect(back).toHaveAttribute("href", "/vehicles/v1");
    expect(
      screen.queryByRole("link", { name: /volver a atenciones/i }),
    ).not.toBeInTheDocument();
  });

  it("blocks the page when a WORKSHOP context is active (RF-1: 403 si el POST corre en WORKSHOP)", async () => {
    selectWorkshop("w1");
    renderPage();

    expect(
      await screen.findByText(/limpiá el contexto activo con la ✕ del chip/i),
    ).toBeInTheDocument();
    expect(mockSearchWorkshops).not.toHaveBeenCalled();
    expect(mockCreateOwner).not.toHaveBeenCalled();
  });

  it("happy path con taller de la app: envía workshopId (y nunca workshopName)", async () => {
    const user = userEvent.setup();
    mockSearchWorkshops.mockResolvedValue([makeWorkshop()]);
    mockCreateOwner.mockResolvedValue({ id: "e1" });

    renderPage();

    await fillServiceForm(user);
    await user.type(screen.getByLabelText(/kilometraje/i), "18500");
    await user.type(screen.getByLabelText(/notas/i), "Aceite 5W30");

    // Búsqueda (≥2 chars) → selección del resultado (nombre + ciudad)
    await user.type(
      screen.getByLabelText(/buscar taller por nombre/i),
      "Lubricentro",
    );
    const resultButton = await screen.findByRole("button", {
      name: /Lubricentro Central/,
    });
    expect(screen.getByText("Córdoba")).toBeInTheDocument();
    await user.click(resultButton);

    await user.click(
      screen.getByRole("button", { name: /registrar servicio/i }),
    );

    // D-074: el POST no ocurre hasta confirmar el modal.
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    // Mensaje de confianza unverified (D-064) + rechazo (diseño aprobado)
    expect(
      await screen.findByText(
        /quedará como "Registrado por el propietario" hasta que Lubricentro Central lo verifique o lo rechace/i,
      ),
    ).toBeInTheDocument();

    expect(mockCreateOwner).toHaveBeenCalledTimes(1);
    expect(mockCreateOwner).toHaveBeenCalledWith({
      vehicleId: "v1",
      title: "Cambio de aceite",
      serviceDate: "2026-06-15",
      workshopId: "w1",
      mileageIn: 18500,
      notes: "Aceite 5W30",
    });
  });

  it("happy path con 'Otro taller': envía workshopName (y nunca workshopId)", async () => {
    const user = userEvent.setup();
    mockCreateOwner.mockResolvedValue({ id: "e2" });

    renderPage();

    await fillServiceForm(user);

    await user.click(screen.getByRole("button", { name: /otro taller/i }));
    await user.type(
      screen.getByLabelText(/nombre del taller/i),
      "Taller de la esquina",
    );

    await user.click(
      screen.getByRole("button", { name: /registrar servicio/i }),
    );

    // D-074: modal de confirmación.
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(
        /quedará como "Registrado por el propietario" hasta que Taller de la esquina lo verifique/i,
      ),
    ).toBeInTheDocument();

    expect(mockCreateOwner).toHaveBeenCalledTimes(1);
    expect(mockCreateOwner).toHaveBeenCalledWith({
      vehicleId: "v1",
      title: "Cambio de aceite",
      serviceDate: "2026-06-15",
      workshopName: "Taller de la esquina",
    });
  });

  it("bloquea fecha futura en cliente (sin llamar a la API)", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillServiceForm(user, { date: addDaysISO(1) });

    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("La fecha no puede ser futura");
    expect(mockCreateOwner).not.toHaveBeenCalled();
  });

  it("bloquea el submit sin taller seleccionado (XOR D-066)", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillServiceForm(user);

    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    expect(
      await screen.findByText(
        /buscá y seleccioná un taller, o elegí la opción "Otro taller"/i,
      ),
    ).toBeInTheDocument();
    expect(mockCreateOwner).not.toHaveBeenCalled();
  });

  it("sin resultados en la búsqueda orienta a 'Otro taller' y permite el flujo texto libre", async () => {
    const user = userEvent.setup();
    mockSearchWorkshops.mockResolvedValue([]);
    mockCreateOwner.mockResolvedValue({ id: "e3" });

    renderPage();

    await fillServiceForm(user);

    await user.type(
      screen.getByLabelText(/buscar taller por nombre/i),
      "xyzq",
    );

    expect(
      await screen.findByText(/no se encontraron talleres con ese nombre/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /otro taller/i }));
    await user.type(
      screen.getByLabelText(/nombre del taller/i),
      "Taller de la esquina",
    );

    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    // D-074: modal de confirmación.
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(/quedará como "Registrado por el propietario"/i),
    ).toBeInTheDocument();
    expect(mockCreateOwner).toHaveBeenCalledWith({
      vehicleId: "v1",
      title: "Cambio de aceite",
      serviceDate: "2026-06-15",
      workshopName: "Taller de la esquina",
    });
  });

  it("muestra 429 con botón Reintentar que re-envía la solicitud", async () => {
    const user = userEvent.setup();
    mockSearchWorkshops.mockResolvedValue([makeWorkshop()]);
    mockCreateOwner
      .mockRejectedValueOnce({
        status: 429,
        message: "ThrottlerException: Too Many Requests",
      })
      .mockResolvedValueOnce({ id: "e1" });

    renderPage();

    await fillServiceForm(user);
    await user.type(
      screen.getByLabelText(/buscar taller por nombre/i),
      "Lubricentro",
    );
    await user.click(
      await screen.findByRole("button", { name: /Lubricentro Central/ }),
    );
    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    // D-074: modal de confirmación → Confirmar dispara el POST que falla.
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(
        /demasiadas solicitudes\. esperá unos segundos/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Reintentar re-envía directamente (sin reabrir modal — D-074).
    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(
      await screen.findByText(
        /quedará como "Registrado por el propietario" hasta que Lubricentro Central lo verifique/i,
      ),
    ).toBeInTheDocument();
    expect(mockCreateOwner).toHaveBeenCalledTimes(2);
    expect(mockCreateOwner).toHaveBeenNthCalledWith(1, {
      vehicleId: "v1",
      title: "Cambio de aceite",
      serviceDate: "2026-06-15",
      workshopId: "w1",
    });
  });

  it("mapea 404 a 'vehículo o taller ya no disponible'", async () => {
    const user = userEvent.setup();
    mockSearchWorkshops.mockResolvedValue([makeWorkshop()]);
    mockCreateOwner.mockRejectedValue({
      status: 404,
      message: "Vehicle not found",
      code: "VEHICLE_NOT_FOUND",
    });

    renderPage();

    await fillServiceForm(user);
    await user.type(
      screen.getByLabelText(/buscar taller por nombre/i),
      "Lubricentro",
    );
    await user.click(
      await screen.findByRole("button", { name: /Lubricentro Central/ }),
    );
    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    // D-074: modal de confirmación → Confirmar dispara el POST.
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(/vehículo o el taller seleccionado ya no está disponible/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reintentar/i }),
    ).not.toBeInTheDocument();
  });

  it("mapea 403 a 'debe ser el propietario'", async () => {
    const user = userEvent.setup();
    mockSearchWorkshops.mockResolvedValue([makeWorkshop()]);
    mockCreateOwner.mockRejectedValue({ status: 403, message: "Forbidden" });

    renderPage();

    await fillServiceForm(user);
    await user.type(
      screen.getByLabelText(/buscar taller por nombre/i),
      "Lubricentro",
    );
    await user.click(
      await screen.findByRole("button", { name: /Lubricentro Central/ }),
    );
    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    // D-074: modal de confirmación → Confirmar dispara el POST.
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(/no tenés permisos para registrar servicios de este vehículo/i),
    ).toBeInTheDocument();
  });

  it("mapea red/5xx y errores de red a un mensaje genérico", async () => {
    const user = userEvent.setup();
    mockCreateOwner.mockRejectedValue({ status: 500, message: "Internal" });

    renderPage();

    await fillServiceForm(user);
    await user.click(screen.getByRole("button", { name: /otro taller/i }));
    await user.type(
      screen.getByLabelText(/nombre del taller/i),
      "Taller de la esquina",
    );
    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    // D-074: modal de confirmación → Confirmar dispara el POST.
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(/error interno del servidor/i),
    ).toBeInTheDocument();
  });

  it("'Registrar otro' resetea el formulario y permite un segundo registro", async () => {
    const user = userEvent.setup();
    mockCreateOwner.mockResolvedValue({ id: "e1" });

    renderPage();

    await fillServiceForm(user);
    await user.click(screen.getByRole("button", { name: /otro taller/i }));
    await user.type(
      screen.getByLabelText(/nombre del taller/i),
      "Taller de la esquina",
    );
    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    // D-074: modal de confirmación → Confirmar dispara el POST.
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(/quedará como "Registrado por el propietario"/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /registrar otro/i }));

    // Formulario de nuevo: el título volvió a estar visible y borrado.
    expect(
      screen.getByLabelText(/título del servicio/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/quedará como "Registrado por el propietario"/i),
    ).not.toBeInTheDocument();
    expect(mockCreateOwner).toHaveBeenCalledTimes(1);
  });
});

// ── Iteración 3 (UX): sugerencias + bottom sheet de catálogo completo ──────

describe("Registrar servicio — sugerencias y listado completo (iteración 3)", () => {
  const catalogWorkshop = (
    id: string,
    name: string,
    city: string | null = null,
  ) => ({ id, name, logoUrl: null, city });

  function mockCatalog({
    suggestions = [] as ReturnType<typeof catalogWorkshop>[],
    pages = {} as Record<number, ReturnType<typeof catalogWorkshop>[]>,
    total = 0,
    totalPages = 1,
  } = {}) {
    mockListCatalog.mockImplementation(
      ({ page = 1, limit = 10 }: { page?: number; limit?: number } = {}) => {
        if (limit === 4 && page === 1) {
          return Promise.resolve({
            data: suggestions,
            meta: {
              total: suggestions.length,
              page: 1,
              limit: 4,
              totalPages: suggestions.length > 0 ? 1 : 0,
            },
          });
        }
        const data = pages[page] ?? [];
        return Promise.resolve({
          data,
          meta: { total, page, limit: 10, totalPages },
        });
      },
    );
  }

  it("muestra sugerencias del catálogo sin escribir y permite seleccionar una", async () => {
    const user = userEvent.setup();
    mockCatalog({
      suggestions: [catalogWorkshop("w-s1", "Taller Sugerido", "Rosario")],
    });

    renderPage();

    const suggestion = await screen.findByRole("button", {
      name: /Taller Sugerido/,
    });
    await user.click(suggestion);

    expect(screen.getByTestId("workshop-selected")).toHaveTextContent(
      "Taller Sugerido",
    );
    expect(screen.getByText("Registrado en Autentia")).toBeInTheDocument();
    // Se eligió de la app: nunca se envía workshopName.
    expect(mockListCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 4 }),
    );
  });

  it("el bottom sheet lista el catálogo y 'Cargar más' trae la página siguiente", async () => {
    const user = userEvent.setup();
    mockCatalog({
      total: 3,
      totalPages: 2,
      pages: {
        1: [
          catalogWorkshop("w1", "Taller Uno", "Córdoba"),
          catalogWorkshop("w2", "Taller Dos"),
        ],
        2: [catalogWorkshop("w3", "Taller Tres")],
      },
    });

    renderPage();

    await user.click(
      screen.getByRole("button", { name: /ver listado completo/i }),
    );

    expect(
      await screen.findByRole("dialog", { name: /talleres en autentia/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Taller Uno")).toBeInTheDocument();
    expect(screen.getByText("Taller Dos")).toBeInTheDocument();
    expect(screen.getByText(/mostrando 2 de 3/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cargar más/i }));

    expect(await screen.findByText("Taller Tres")).toBeInTheDocument();
    expect(screen.getByText(/mostrando 3 de 3/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cargar más/i }),
    ).not.toBeInTheDocument();
  });

  it("seleccionar un taller en el bottom sheet lo marca como registrado y cierra el sheet", async () => {
    const user = userEvent.setup();
    mockCatalog({
      total: 1,
      totalPages: 1,
      pages: { 1: [catalogWorkshop("w1", "Taller Uno", "Córdoba")] },
    });

    renderPage();

    await user.click(
      screen.getByRole("button", { name: /seleccionar de la lista/i }),
    );
    await user.click(await screen.findByRole("button", { name: /Taller Uno/ }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("workshop-selected")).toHaveTextContent(
      "Taller Uno",
    );
    expect(screen.getByText("Registrado en Autentia")).toBeInTheDocument();
  });

  it("sin resultados en el sheet permite pasar el texto a 'taller libre'", async () => {
    const user = userEvent.setup();
    mockCatalog({ total: 0, totalPages: 0, pages: { 1: [] } });
    mockSearchWorkshops.mockResolvedValue([]);

    renderPage();

    await user.click(
      screen.getByRole("button", { name: /ver listado completo/i }),
    );
    await user.type(
      screen.getByLabelText(/buscar en el listado de talleres/i),
      "Taller Fantasma",
    );

    expect(
      await screen.findByText(/no encontramos talleres/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /como taller libre/i }),
    );

    // Cambia a modo texto libre con el nombre precargado.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/nombre del taller/i)).toHaveValue(
      "Taller Fantasma",
    );
    expect(screen.getByText("Taller libre")).toBeInTheDocument();
  });

  it("mantiene el taller libre como alternativa desde la búsqueda", async () => {
    const user = userEvent.setup();
    mockCatalog({ suggestions: [] });

    renderPage();

    await user.click(
      screen.getByRole("button", { name: /usar otro taller/i }),
    );

    expect(screen.getByLabelText(/nombre del taller/i)).toBeInTheDocument();
    expect(screen.getByText("Taller libre")).toBeInTheDocument();

    // Y permite volver a la búsqueda.
    await user.click(
      screen.getByRole("button", { name: /volver a buscar en la app/i }),
    );
    expect(
      screen.getByLabelText(/buscar taller por nombre/i),
    ).toBeInTheDocument();
  });
});

// ── D-074: modal de confirmación (iteración 2-3) ─────────────────────────────

describe("Registrar servicio — modal de confirmación (D-074)", () => {
  it("al enviar muestra el modal con el copy exacto y 'Cancelar' no llama a la API", async () => {
    const user = userEvent.setup();
    mockCreateOwner.mockResolvedValue({ id: "e1" });

    renderPage();

    await fillServiceForm(user);
    await user.click(screen.getByRole("button", { name: /otro taller/i }));
    await user.type(
      screen.getByLabelText(/nombre del taller/i),
      "Taller de la esquina",
    );
    await user.click(
      screen.getByRole("button", { name: /registrar servicio/i }),
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      /no podrás editar ni cancelar este registro desde tu cuenta/i,
    );
    expect(mockCreateOwner).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockCreateOwner).not.toHaveBeenCalled();
    // El form sigue disponible.
    expect(screen.getByLabelText(/título del servicio/i)).toBeInTheDocument();
  });

  it("'Confirmar' dispara el POST y muestra el mensaje de confianza", async () => {
    const user = userEvent.setup();
    mockCreateOwner.mockResolvedValue({ id: "e1" });

    renderPage();

    await fillServiceForm(user);
    await user.click(screen.getByRole("button", { name: /otro taller/i }));
    await user.type(
      screen.getByLabelText(/nombre del taller/i),
      "Taller de la esquina",
    );
    await user.click(
      screen.getByRole("button", { name: /registrar servicio/i }),
    );

    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(
        /quedará como "Registrado por el propietario" hasta que Taller de la esquina lo verifique/i,
      ),
    ).toBeInTheDocument();
    expect(mockCreateOwner).toHaveBeenCalledTimes(1);
  });

  it("muestra estado de envío en el modal y deshabilita 'Cancelar' mientras confirma", async () => {
    const user = userEvent.setup();
    let resolveCreate!: (value: unknown) => void;
    mockCreateOwner.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    renderPage();

    await fillServiceForm(user);
    await user.click(screen.getByRole("button", { name: /otro taller/i }));
    await user.type(
      screen.getByLabelText(/nombre del taller/i),
      "Taller de la esquina",
    );
    await user.click(
      screen.getByRole("button", { name: /registrar servicio/i }),
    );

    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(screen.getByText("Enviando...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeDisabled();
    expect(mockCreateOwner).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate({ id: "e1" });
    });

    expect(
      await screen.findByText(
        /quedará como "Registrado por el propietario"/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// ── Iteración 2-4: evidencia en la creación del servicio owner (S6/D-074A) ──

describe("Registrar servicio — evidencia en la creación (iteración 2-4)", () => {
  it("con fotos adjuntas → D-074A en el modal + multipart transaccional + link al detalle", async () => {
    const user = userEvent.setup();
    const file = new File(["a"], "foto.jpg", { type: "image/jpeg" });
    mockCreateOwnerWithFiles.mockResolvedValue({
      id: "e1",
      attachments: [],
      attachmentCount: 0,
    });

    renderPage();

    await fillServiceForm(user);
    await user.click(screen.getByRole("button", { name: /otro taller/i }));
    await user.type(
      screen.getByLabelText(/nombre del taller/i),
      "Taller de la esquina",
    );
    await user.upload(screen.getByTestId("owner-evidence-input"), file);

    // Preview del archivo
    expect(screen.getByText("foto.jpg")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /registrar servicio/i }),
    );

    // D-074 intacto + D-074A aditiva (evidencia).
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      /no podrás editar ni cancelar este registro desde tu cuenta/i,
    );
    expect(dialog).toHaveTextContent(
      /se adjuntará 1 foto como evidencia en el historial del vehículo/i,
    );
    expect(mockCreateOwner).not.toHaveBeenCalled();
    expect(mockCreateOwnerWithFiles).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(
        /quedará como "Registrado por el propietario"/i,
      ),
    ).toBeInTheDocument();

    // Link al nuevo detalle deep-linkable (2-4) usando el id devuelto.
    expect(
      screen.getByRole("link", { name: /ver detalle del servicio/i }),
    ).toHaveAttribute("href", "/vehicles/v1/servicios/e1");

    expect(mockCreateOwnerWithFiles).toHaveBeenCalledTimes(1);
    expect(mockCreateOwner).not.toHaveBeenCalled();

    const [input, files, captions, onProgress] =
      mockCreateOwnerWithFiles.mock.calls[0];
    expect(input).toMatchObject({
      vehicleId: "v1",
      title: "Cambio de aceite",
      serviceDate: "2026-06-15",
      workshopName: "Taller de la esquina",
    });
    expect(files).toEqual([file]);
    expect(captions).toBeUndefined();
    // Regresión ERR_ALPN_NEGOTIATION_FAILED: la creación multipart NO debe
    // recibir callback de progreso. En ky, `onUploadProgress` fuerza el body a
    // viajar como stream (`duplex: 'half'`) y Chromium solo lo permite sobre
    // HTTP/2 o HTTP/3; sobre HTTP/1.1 la request falla. Debe ir buffered.
    expect(onProgress).toBeUndefined();
    expect(mockCreateOwnerWithFiles.mock.calls[0]).toHaveLength(3);
  });

  it("sin fotos adjuntas → JSON histórico (createOwnerCareEpisode) y sin multipart", async () => {
    const user = userEvent.setup();
    mockCreateOwner.mockResolvedValue({ id: "e1" });

    renderPage();

    await fillServiceForm(user);
    await user.click(screen.getByRole("button", { name: /otro taller/i }));
    await user.type(
      screen.getByLabelText(/nombre del taller/i),
      "Taller de la esquina",
    );
    await user.click(
      screen.getByRole("button", { name: /registrar servicio/i }),
    );
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(
        /quedará como "Registrado por el propietario"/i,
      ),
    ).toBeInTheDocument();
    expect(mockCreateOwner).toHaveBeenCalledTimes(1);
    expect(mockCreateOwnerWithFiles).not.toHaveBeenCalled();
  });

  it("archivo de tipo no válido → error en línea y no acumula", async () => {
    // applyAccept: false → user-event NO filtra por accept y el .txt llega al
    // handler; queremos probar QUE la validación del handler lo rechaza.
    const user = userEvent.setup({ applyAccept: false });

    renderPage();

    await user.upload(
      screen.getByTestId("owner-evidence-input"),
      new File(["x"], "nota.txt", { type: "text/plain" }),
    );

    expect(
      await screen.findByText(
        /solo se admiten imágenes jpg, png, webp o avif/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("nota.txt")).not.toBeInTheDocument();
  });

  it("lote de más de 5 fotos → error en línea y no acumula", async () => {
    const user = userEvent.setup();

    renderPage();

    const files = Array.from(
      { length: 6 },
      (_, i) => new File(["a"], `f${i}.jpg`, { type: "image/jpeg" }),
    );
    await user.upload(screen.getByTestId("owner-evidence-input"), files);

    expect(
      await screen.findByText(/podés adjuntar hasta 5 imágenes por vez/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/f0\.jpg/)).not.toBeInTheDocument();
    expect(mockCreateOwner).not.toHaveBeenCalled();
  });

  it("regresión FileList vivo: acumula los archivos aunque limpiar el input vacíe la selección", () => {
    // El FileList de un <input type="file"> es VIVO en los navegadores:
    // asignar `value = ""` vacía la selección. happy-dom no lo simula, por
    // eso el bug (leer files DESPUÉS de limpiar) pasaba invisible en test.
    renderPage();

    const input = screen.getByTestId("owner-evidence-input");
    const file = new File(["a"], "foto-viva.jpg", { type: "image/jpeg" });
    let liveList: File[] = [file];

    Object.defineProperty(input, "files", {
      configurable: true,
      get: () => liveList,
    });
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => "",
      set: () => {
        liveList = [];
      },
    });

    fireEvent.change(input);

    expect(
      screen.getByTestId("evidence-file-foto-viva.jpg"),
    ).toBeInTheDocument();
  });
});