/**
 * Tests for the CareEpisode detail page (iteración 2-4, S1/S4/S5/S6).
 *
 * Ruta: /vehicles/[id]/servicios/[servicioId]
 * - Loading / terminales 404 / 403 / 5xx+Reintentar.
 * - Proyección por actor: taller del episodio ve internalNotes; owner no.
 * - Galería de evidencia agrupada por fase + EmptyState.
 * - Uploader SOLO para taller-del-episodio + open + unverified (S4).
 * - Remoción S5: botón disabled+copytip para no autorizados; dialog con
 *   motivo OBLIGATORIO para el propietario; DELETE → invalida (refetch).
 * - Upload secuencial (1 request por archivo) → onUploaded invalida.
 *
 * Backend siempre es la autoridad; la página solo decide VISIBILIDAD y
 * feedback (los errores del backend se resuelven en care-episode-errors.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ActiveContext } from "@/lib/active-context";
import type {
  CareEpisodeAttachment,
  CareEpisodeDetail,
} from "@/types/care-episode";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "v1", servicioId: "e1" }),
}));

const mockGetDetail = vi.fn();
const mockUpload = vi.fn();
const mockDelete = vi.fn();
const mockClose = vi.fn();

vi.mock("@/lib/api", () => ({
  careEpisodeApi: {
    getCareEpisodeDetail: (...args: unknown[]) => mockGetDetail(...args),
    uploadAttachment: (...args: unknown[]) => mockUpload(...args),
    deleteAttachment: (...args: unknown[]) => mockDelete(...args),
    closeCareEpisode: (...args: unknown[]) => mockClose(...args),
  },
}));

let authUser: { id: string; isVehicleOwner: boolean } | null;
let activeContext: ActiveContext;

const mockUseAuth = vi.fn();
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseActiveContext = vi.fn();
vi.mock("@/hooks/use-active-context", () => ({
  useActiveContext: () => mockUseActiveContext(),
}));

// Mock UI primitives (convención repo) — dialog se controla por `open`.
// `buttonVariants` se mantiene como stub puro: el 404 usa Link +
// buttonVariants({ variant: "outline" }) y el test solo verifica el href.
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
  CardHeader: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardDescription: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
}));
vi.mock("@/components/ui/dialog", () => {
  const Dialog = ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div role="dialog">{children}</div> : null);
  const DialogPopup = ({
    children,
    ...props
  }: React.ComponentProps<"div">) => <div {...props}>{children}</div>;
  const DialogTitle = ({
    children,
    ...props
  }: React.ComponentProps<"div">) => <h2 {...props}>{children}</h2>;
  const DialogDescription = ({
    children,
    ...props
  }: React.ComponentProps<"div">) => <div {...props}>{children}</div>;
  const DialogClose = ({
    children,
    ...props
  }: React.ComponentProps<"button">) => <button {...props}>{children}</button>;
  return { Dialog, DialogPopup, DialogTitle, DialogDescription, DialogClose };
});
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.ComponentProps<"label">) => (
    <label {...props}>{children}</label>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: (props: React.ComponentProps<"select">) => <select {...props} />,
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.ComponentProps<"textarea">) => (
    <textarea {...props} />
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAttachment(
  overrides: Partial<CareEpisodeAttachment> = {},
): CareEpisodeAttachment {
  return {
    id: "a1",
    key: "care-episodes/e1/a1",
    originalName: "foto.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1234,
    caption: "Recepción del vehículo",
    phase: "before",
    uploadedByMemberId: "m1",
    uploadedByUserId: null,
    removed: false,
    createdAt: "2026-09-12T10:05:00.000Z",
    url: "https://signed.example/a1",
    expiresAt: "2026-09-13T10:05:00.000Z",
    ...overrides,
  };
}

function makeDetail(overrides: Partial<CareEpisodeDetail> = {}): CareEpisodeDetail {
  return {
    id: "e1",
    vehicleId: "v1",
    vehicle: {
      id: "v1",
      licensePlate: "ABC123",
      brand: "Toyota",
      model: "Corolla",
      manufactureYear: 2020,
    },
    status: "open",
    source: "workshop",
    verification: "unverified",
    title: "Cambio de aceite",
    serviceDate: "2026-09-12",
    workshopId: "w1",
    workshopName: "Lubricentro Central",
    mileageIn: 68500,
    mileageOut: null,
    mileageOutUnreadable: false,
    mileageOutUnreadableReason: null,
    closeNotes: null,
    serviceTypes: [],
    customerComplaint: "Ruido al acelerar",
    customerNotes: "Aceite 5W30",
    internalNotes: undefined,
    checkedInAt: "2026-09-12T09:00:00.000Z",
    closedAt: null,
    createdAt: "2026-09-12T10:00:00.000Z",
    attachments: { before: [], work: [], after: [], other: [] },
    attachmentCount: 0,
    ...overrides,
  };
}

let CareEpisodeDetailPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  authUser = { id: "u1", isVehicleOwner: true };
  activeContext = null;
  mockUseAuth.mockImplementation(() => ({
    user: authUser,
    status: "authenticated",
  }));
  mockUseActiveContext.mockImplementation(() => activeContext);
  mockGetDetail.mockResolvedValue(makeDetail());
  mockUpload.mockResolvedValue(makeAttachment({ id: "a1" }));
  mockDelete.mockResolvedValue(undefined);
  mockClose.mockResolvedValue({
    data: {
      id: "e1",
      status: "delivered",
      closedAt: "2026-11-17T12:00:00.000Z",
      mileageOut: 68600,
      mileageOutUnreadable: false,
      mileageOutlier: false,
    },
  });
  const mod = await import(
    "@/app/(dashboard)/vehicles/[id]/servicios/[servicioId]/page"
  );
  CareEpisodeDetailPage = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CareEpisodeDetailPage />
    </QueryClientProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("CareEpisode detail page (iteración 2-4)", () => {
  it("muestra el spinner mientras carga (S1)", async () => {
    mockGetDetail.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(
      await screen.findByRole("status", { name: "Cargando servicio" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Cambio de aceite")).not.toBeInTheDocument();
  });

  it("404 (PERSONAL) → terminal 'Servicio no encontrado' + Volver al vehículo", async () => {
    mockGetDetail.mockRejectedValue({ status: 404, message: "Not found" });

    renderPage();

    expect(await screen.findByText("Servicio no encontrado")).toBeInTheDocument();
    expect(
      screen.getByText(/servicio no encontrado o ya no está disponible/i),
    ).toBeInTheDocument();

    const back = screen.getByRole("link", { name: /volver al vehículo/i });
    expect(back).toHaveAttribute("href", "/vehicles/v1");
  });

  it("contexto WORKSHOP → el back-link del header va a /atenciones (Volver a atenciones)", async () => {
    activeContext = { type: "WORKSHOP", workshopId: "w1" };

    renderPage();

    expect(await screen.findByText("Cambio de aceite")).toBeInTheDocument();
    const back = screen.getByRole("link", { name: "Volver a atenciones" });
    expect(back).toHaveAttribute("href", "/atenciones");
    expect(
      screen.queryByRole("link", { name: /volver al vehículo/i }),
    ).not.toBeInTheDocument();
  });

  it("contexto WORKSHOP + 404 → la terminal vuelve a /atenciones, no al vehículo", async () => {
    activeContext = { type: "WORKSHOP", workshopId: "w1" };
    mockGetDetail.mockRejectedValue({ status: 404, message: "Not found" });

    renderPage();

    expect(await screen.findByText("Servicio no encontrado")).toBeInTheDocument();
    const back = screen.getByRole("link", { name: /volver a atenciones/i });
    expect(back).toHaveAttribute("href", "/atenciones");
  });

  it("5xx → mensaje de error del servidor + Reintentar refetchea", async () => {
    const user = userEvent.setup();
    mockGetDetail
      .mockRejectedValueOnce({ status: 500, message: "Server error" })
      .mockResolvedValueOnce(makeDetail());

    renderPage();

    expect(
      await screen.findByText("No se pudo cargar el servicio"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/el servidor tuvo un problema/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(await screen.findByText("Cambio de aceite")).toBeInTheDocument();
    expect(mockGetDetail).toHaveBeenCalledTimes(2);
  });

  it("403 → copy de permiso + Reintentar (sin back-link de 404)", async () => {
    const user = userEvent.setup();
    mockGetDetail
      .mockRejectedValueOnce({ status: 403, message: "Forbidden" })
      .mockResolvedValueOnce(makeDetail());

    renderPage();

    expect(
      await screen.findByText(/no tenés permiso para ver este servicio/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /volver al vehículo/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(await screen.findByText("Cambio de aceite")).toBeInTheDocument();
  });

  it("proyección owner: ve reclamo/notas pero NUNCA internalNotes; sin uploader en episodio owner (S1)", async () => {
    mockGetDetail.mockResolvedValue(
      makeDetail({
        source: "owner",
        verification: "unverified",
        internalNotes: undefined,
      }),
    );

    renderPage();

    expect(await screen.findByText("Cambio de aceite")).toBeInTheDocument();
    expect(screen.getByText("Ruido al acelerar")).toBeInTheDocument();
    expect(screen.getByText("Aceite 5W30")).toBeInTheDocument();
    expect(screen.getByText("Registrado por el propietario")).toBeInTheDocument();
    expect(screen.queryByText("Notas internas")).not.toBeInTheDocument();

    // Episodios owner no admiten evidencia posterior (403 backend).
    expect(
      screen.queryByRole("button", { name: /adjuntar fotos/i }),
    ).not.toBeInTheDocument();

    // EmptyState de la galería
    expect(
      screen.getByText("Sin imágenes de evidencia"),
    ).toBeInTheDocument();
  });

  // ── Rechazo de verificación (diseño aprobado) ──────────────────────────────

  it("verification 'rejected' → badge 'Rechazado por {taller}' + Callout con motivo", async () => {
    mockGetDetail.mockResolvedValue(
      makeDetail({
        source: "owner",
        verification: "rejected",
        rejectionReason: "No consta en nuestros registros",
        rejectedAt: "2026-09-12T12:00:00.000Z",
        rejectedByMemberId: "m1",
      }),
    );

    renderPage();

    expect(await screen.findByText("Cambio de aceite")).toBeInTheDocument();

    // Badge destructivo con el taller; NUNCA los copy de pendiente/verificado.
    const badge = screen.getByText("Rechazado por Lubricentro Central");
    expect(badge).toBeInTheDocument();
    // Rediseño (Design System): el estado pasó a ser un pill TINTADO con el
    // tono destructivo (`bg-destructive/10` + texto foreground) porque el pill
    // sólido con texto blanco no llegaba a contraste AA. Se sigue verificando
    // que el estado de rechazo use el tono destructivo.
    expect(badge).toHaveClass("bg-destructive/10");
    expect(
      screen.queryByText("Registrado por el propietario"),
    ).not.toBeInTheDocument();

    // Callout explicativo con el motivo entre « ».
    expect(
      screen.getByText(
        /el taller responsable indicó que este servicio no corresponde/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/motivo: «no consta en nuestros registros»/i),
    ).toBeInTheDocument();
  });

  it("verification 'rejected' sin motivo → Callout sin la línea 'Motivo:'", async () => {
    mockGetDetail.mockResolvedValue(
      makeDetail({
        source: "owner",
        verification: "rejected",
        rejectionReason: null,
      }),
    );

    renderPage();

    expect(await screen.findByText("Rechazado por Lubricentro Central")).toBeInTheDocument();
    expect(
      screen.getByText(
        /el taller responsable indicó que este servicio no corresponde/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/motivo:/i)).not.toBeInTheDocument();
  });

  it("proyección taller-del-episodio: ve internalNotes, uploader visible y remoción sin motivo (S1/S4/S5)", async () => {
    const user = userEvent.setup();
    authUser = { id: "u1", isVehicleOwner: false };
    activeContext = { type: "WORKSHOP", workshopId: "w1" };
    mockGetDetail.mockResolvedValue(
      makeDetail({
        internalNotes: "Repasar ajuste de frenos",
        attachments: {
          before: [makeAttachment({ id: "a1" })],
          work: [],
          after: [],
          other: [],
        },
        attachmentCount: 1,
      }),
    );

    renderPage();

    expect(await screen.findByText("Notas internas")).toBeInTheDocument();
    expect(screen.getByText("Repasar ajuste de frenos")).toBeInTheDocument();

    // Uploader habilitado (fuente workshop + contexto del taller + open + unverified)
    expect(screen.getByRole("button", { name: /adjuntar fotos/i })).toBeEnabled();

    // Galería: grupo "Antes" (heading; getByText matchearía también el
    // <option value="before">Antes</option> del select de fase del uploader)
    expect(
      screen.getByRole("heading", { name: /antes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Recepción del vehículo" }),
    ).toBeInTheDocument();

    // Remoción visible SIN botón disabled (miembro del taller del episodio)
    expect(screen.queryAllByTestId("remove-disabled")).toHaveLength(0);
    await user.click(
      screen.getByRole("button", { name: /eliminar imagen recepción del vehículo/i }),
    );

    // Diálogo sin selector de motivo (self-removal / cleanup del taller)
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Eliminar imagen");
    expect(dialog).toHaveTextContent(
      /se eliminará de la historia del vehículo/i,
    );
    expect(
      screen.queryByLabelText(/motivo/i),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("e1", "a1", {});
    });
    // éxito → invalida → refetch del detalle
    await waitFor(() => {
      expect(mockGetDetail.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("propietario en PERSONAL: remoción exige motivo y envía removedReason (S5)", async () => {
    const user = userEvent.setup();
    authUser = { id: "u1", isVehicleOwner: true };
    activeContext = null;
    mockGetDetail.mockResolvedValue(
      makeDetail({
        source: "owner",
        verification: "unverified",
        attachments: { before: [], work: [], after: [], other: [makeAttachment()] },
        attachmentCount: 1,
      }),
    );

    renderPage();

    const deleteButton = await screen.findByRole("button", {
      name: /eliminar imagen recepción del vehículo/i,
    });
    await user.click(deleteButton);

    await screen.findByRole("dialog");
    const reasonSelect = screen.getByLabelText(/motivo/i);
    expect(reasonSelect).toBeInTheDocument();

    // Submit deshabilitado hasta elegir motivo
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeDisabled();

    await user.selectOptions(reasonSelect, "duplicada");

    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("e1", "a1", {
        removedReason: "duplicada",
      });
    });
  });

  it("lector neutral (taller ajeno): botón de eliminación disabled con copytip y SIN uploader (S5)", async () => {
    authUser = { id: "u1", isVehicleOwner: false };
    activeContext = { type: "WORKSHOP", workshopId: "w2" }; // taller distinto
    mockGetDetail.mockResolvedValue(
      makeDetail({
        attachments: {
          before: [],
          work: [makeAttachment({ id: "a2", caption: null })],
          after: [],
          other: [],
        },
        attachmentCount: 1,
      }),
    );

    renderPage();

    await screen.findByText("Cambio de aceite");

    // Sin zona de subida (no es el taller del episodio)
    expect(
      screen.queryByRole("button", { name: /adjuntar fotos/i }),
    ).not.toBeInTheDocument();

    // Botón remove en estado disabled + tooltip nativo
    const disabledHints = screen.getAllByTestId("remove-disabled");
    expect(disabledHints).toHaveLength(1);
    expect(disabledHints[0]).toHaveAttribute(
      "title",
      "Solo el taller del servicio o el propietario pueden eliminar evidencia.",
    );
    // La imagen sin caption usa el alt por defecto
    expect(
      screen.getByRole("img", { name: "Evidencia de servicio" }),
    ).toBeInTheDocument();
  });

  it("upload secuencial: 1 request por archivo, progreso en barras y refetch post éxito (S4)", async () => {
    const user = userEvent.setup();
    authUser = { id: "u1", isVehicleOwner: false };
    activeContext = { type: "WORKSHOP", workshopId: "w1" };

    renderPage();

    await screen.findByText("Cambio de aceite");

    const f1 = new File(["a"], "f1.jpg", { type: "image/jpeg" });
    const f2 = new File(["b"], "f2.png", { type: "image/png" });
    await user.upload(screen.getByTestId("attachment-file-input"), [f1, f2]);

    // Fase default "after" para el tablero de taller
    await user.click(screen.getByRole("button", { name: /subir 2 fotos/i }));

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(2);
    });
    expect(mockUpload.mock.calls[0][0]).toBe("e1");
    expect(mockUpload.mock.calls[0][1]).toMatchObject({
      file: f1,
      phase: "after",
    });
    expect(mockUpload.mock.calls[1][1]).toMatchObject({
      file: f2,
      phase: "after",
    });

    // Regresión ERR_ALPN_NEGOTIATION_FAILED: cada upload va con SOLO 2
    // argumentos (id, dto). Pasar un callback de progreso haría que ky envíe un
    // body streamed (`duplex: 'half'`) que rompe sobre HTTP/1.1 (ver api.ts).
    expect(mockUpload.mock.calls[0]).toHaveLength(2);
    expect(mockUpload.mock.calls[1]).toHaveLength(2);

    expect(
      await screen.findByText("2 imágenes subidas"),
    ).toBeInTheDocument();

    // onUploaded → invalida → refetch del detalle
    await waitFor(() => {
      expect(mockGetDetail.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("upload fallido → error inline con Reintentar que solo re-intenta ese archivo (S4)", async () => {
    const user = userEvent.setup();
    authUser = { id: "u1", isVehicleOwner: false };
    activeContext = { type: "WORKSHOP", workshopId: "w1" };

    mockUpload
      .mockRejectedValueOnce({ status: 413, message: "Payload Too Large" })
      .mockResolvedValueOnce(makeAttachment({ id: "a2" }));

    renderPage();

    await screen.findByText("Cambio de aceite");

    const f1 = new File(["a"], "f1.jpg", { type: "image/jpeg" });
    const f2 = new File(["b"], "f2.png", { type: "image/png" });
    await user.upload(screen.getByTestId("attachment-file-input"), [f1, f2]);
    await user.click(screen.getByRole("button", { name: /subir 2 fotos/i }));

    // Un archivo falló con el copy de 413; el segundo subió bien.
    expect(
      await screen.findByText(/la imagen supera el tamaño máximo de 5mb/i),
    ).toBeInTheDocument();
    expect(await screen.findByText("1 imagen subida")).toBeInTheDocument();

    // Reintentar re-envía SOLO el archivo fallido.
    mockUpload.mockClear();
    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(1);
    });
    expect(mockUpload.mock.calls[0][1].file).toBe(f1);
  });

  // ── Cierre de atención (B-3) ──────────────────────────────────────────────

  it("sin contexto WORKSHOP o con estado no-open: NO muestra 'Cerrar atención'", async () => {
    // PERSONAL (dueño): nunca ve la acción de cierre.
    renderPage();
    await screen.findByText("Cambio de aceite");
    expect(
      screen.queryByRole("button", { name: /cerrar atención/i }),
    ).not.toBeInTheDocument();
  });

  it("taller del episodio + open: botón visible; cerrado: oculto", async () => {
    activeContext = { type: "WORKSHOP", workshopId: "w1" };
    mockGetDetail.mockResolvedValueOnce(makeDetail()).mockResolvedValue(
      makeDetail({ status: "delivered", closedAt: "2026-11-17T12:00:00.000Z" }),
    );
    const user = userEvent.setup();

    renderPage();

    await screen.findByText("Cambio de aceite");
    const closeButton = screen.getByRole("button", {
      name: /cerrar atención/i,
    });
    expect(closeButton).toBeInTheDocument();
    await user.click(closeButton);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Odómetro de egreso");
    expect(dialog).toHaveTextContent("Diagnóstico / resumen de la atención");
    expect(dialog).toHaveTextContent("0/1000 · mínimo 10 caracteres");
    // Sin datos válidos, el submit está bloqueado.
    expect(
      screen.getByRole("button", { name: /confirmar cierre/i }),
    ).toBeDisabled();

    // El odómetro de ingreso se precarga editable.
    const kilometraje = screen.getByLabelText("Kilometraje");
    expect(kilometraje).toHaveValue(68500);
    expect(dialog).toHaveTextContent(
      "Odómetro de ingreso: 68.500 km · Dejalo tal cual si no cambió.",
    );
    await user.clear(kilometraje);
    await user.type(kilometraje, "68600");
    await user.type(
      screen.getByLabelText(/diagnóstico \/ resumen/i),
      "Cambio de aceite y filtro, frenos revisados sin novedades.",
    );
    await user.click(screen.getByRole("button", { name: /confirmar cierre/i }));

    await waitFor(() => {
      expect(mockClose).toHaveBeenCalledWith("e1", {
        mileageOut: 68600,
        closeNotes:
          "Cambio de aceite y filtro, frenos revisados sin novedades.",
      });
    });

    // Éxito → modal cerrado, refetch → badge "Entregado" y sin botón.
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("Entregado")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cerrar atención/i }),
    ).not.toBeInTheDocument();
  });

  it("muestra 'Diagnóstico / resumen' cuando el episodio cerrado las tiene", async () => {
    activeContext = { type: "WORKSHOP", workshopId: "w1" };
    mockGetDetail.mockResolvedValue(
      makeDetail({
        status: "delivered",
        closedAt: "2026-11-17T12:00:00.000Z",
        closeNotes: "Cambio de aceite y filtro; se reemplazó la batería.",
      }),
    );

    renderPage();

    expect(
      await screen.findByText("Diagnóstico / resumen"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Cambio de aceite y filtro; se reemplazó la batería."),
    ).toBeInTheDocument();
  });

  it("valida el resumen corto y el egreso menor al ingreso antes de enviar", async () => {
    activeContext = { type: "WORKSHOP", workshopId: "w1" };
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Cambio de aceite");
    await user.click(
      screen.getByRole("button", { name: /cerrar atención/i }),
    );

    const submit = screen.getByRole("button", { name: /confirmar cierre/i });
    const kilometraje = screen.getByLabelText("Kilometraje");
    await user.clear(kilometraje);
    await user.type(kilometraje, "68600");
    await user.type(
      screen.getByLabelText(/diagnóstico \/ resumen/i),
      "Muy corto",
    );
    expect(submit).toBeDisabled(); // < 10 caracteres

    await user.type(
      screen.getByLabelText(/diagnóstico \/ resumen/i),
      " , frenos revisados sin novedades.",
    );
    expect(submit).toBeEnabled();

    // 68000 < mileageIn (68500): el backend devolvería 400, se bloquea acá.
    const mileageInput = screen.getByLabelText("Kilometraje");
    await user.clear(mileageInput);
    await user.type(mileageInput, "68000");
    expect(submit).toBeDisabled();
    expect(
      screen.getByText(/el egreso no puede ser menor al ingreso/i),
    ).toBeInTheDocument();
    expect(mockClose).not.toHaveBeenCalled();
  });

  it("odómetro no legible: avisa la foto 'after' y envía la excepción XOR", async () => {
    activeContext = { type: "WORKSHOP", workshopId: "w1" };
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Cambio de aceite");
    await user.click(
      screen.getByRole("button", { name: /cerrar atención/i }),
    );

    await user.click(
      screen.getByLabelText("No se puede leer el odómetro"),
    );

    // Sin adjuntos 'after' → aviso (el backend lo valida).
    expect(
      screen.getByText(/adjuntá una foto del tablero en «evidencias»/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Kilometraje")).toBeDisabled();
    expect(screen.getByLabelText(/motivo \(mínimo 3 caracteres\)/i)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/motivo \(mínimo 3 caracteres\)/i),
      "Tablero sin display",
    );
    await user.type(
      screen.getByLabelText(/diagnóstico \/ resumen/i),
      "Se reemplazó el tablero, odómetro no legible al egreso.",
    );
    await user.click(screen.getByRole("button", { name: /confirmar cierre/i }));

    await waitFor(() => {
      expect(mockClose).toHaveBeenCalledWith("e1", {
        mileageOutUnreadable: true,
        mileageOutUnreadableReason: "Tablero sin display",
        closeNotes:
          "Se reemplazó el tablero, odómetro no legible al egreso.",
      });
    });
  });

  it("409 al cerrar → error inline y el modal sigue abierto", async () => {
    activeContext = { type: "WORKSHOP", workshopId: "w1" };
    mockClose.mockRejectedValueOnce({ status: 409, message: "Conflict" });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Cambio de aceite");
    await user.click(
      screen.getByRole("button", { name: /cerrar atención/i }),
    );
    const kilometraje409 = screen.getByLabelText("Kilometraje");
    await user.clear(kilometraje409);
    await user.type(kilometraje409, "68600");
    await user.type(
      screen.getByLabelText(/diagnóstico \/ resumen/i),
      "Cambio de aceite y filtro, frenos revisados sin novedades.",
    );
    await user.click(screen.getByRole("button", { name: /confirmar cierre/i }));

    expect(
      await screen.findByText("Esta atención ya fue cerrada."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("mileageOutlier en la respuesta → aviso informativo tras el cierre", async () => {
    activeContext = { type: "WORKSHOP", workshopId: "w1" };
    mockClose.mockResolvedValueOnce({
      data: {
        id: "e1",
        status: "delivered",
        closedAt: "2026-11-17T12:00:00.000Z",
        mileageOut: 68600,
        mileageOutUnreadable: false,
        mileageOutlier: true,
      },
    });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Cambio de aceite");
    await user.click(
      screen.getByRole("button", { name: /cerrar atención/i }),
    );
    // 68600 > mileageIn (68500): válido, pero menor al máximo histórico.
    const kilometrajeOutlier = screen.getByLabelText("Kilometraje");
    await user.clear(kilometrajeOutlier);
    await user.type(kilometrajeOutlier, "68600");
    await user.type(
      screen.getByLabelText(/diagnóstico \/ resumen/i),
      "Cambio de aceite y filtro, frenos revisados sin novedades.",
    );
    await user.click(screen.getByRole("button", { name: /confirmar cierre/i }));

    expect(
      await screen.findByText(/por debajo del máximo histórico/i),
    ).toBeInTheDocument();
  });

  it("ingreso ilegible (mileageIn null): no precarga y avisa en el modal", async () => {
    activeContext = { type: "WORKSHOP", workshopId: "w1" };
    mockGetDetail.mockResolvedValue(makeDetail({ mileageIn: null }));
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Cambio de aceite");
    await user.click(
      screen.getByRole("button", { name: /cerrar atención/i }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(screen.getByLabelText("Kilometraje")).toHaveValue(null);
    expect(dialog).toHaveTextContent(
      "No hay odómetro de ingreso legible; ingresá el valor o marcá «No se puede leer».",
    );
  });
});