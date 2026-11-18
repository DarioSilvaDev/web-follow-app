/**
 * Tests for the "Verificaciones" page (iteración 2-2, taller).
 *
 * Critical behaviors (spec 2-2 §5-§9, RF-4/RF-5/RF-8, D-024 A2 / D-035):
 * - WORKSHOP-only: sin taller seleccionado solo orienta (el GET no corre).
 * - GET /care-episodes/verifications: cola del taller del contexto activo.
 * - Confirmar → abre el dialog de confirmación (design system) → POST
 *   /care-episodes/:id/verify.
 * - Éxito → badge "Verificado por {taller}" y desaparece el botón Confirmar.
 * - Cancelar el dialog → NO llama a la API.
 * - Empty state "Sin verificaciones pendientes".
 * - Error de carga + Reintentar.
 * - 409 del verify → mensaje "ya fue verificado por otro taller".
 * - Rechazo (diseño aprobado): dialog con motivo opcional → POST
 *   /care-episodes/:id/reject → badge "Rechazado" (destructive) + invalidación
 *   de cola/listado/detalle/historial; errores 403/404/409 mapeados por item;
 *   cancelar NO llama a la API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearWorkshop, selectWorkshop } from "@/lib/active-context";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockGetVerifications = vi.fn();
const mockVerify = vi.fn();
const mockReject = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("@/lib/api", () => ({
  careEpisodeApi: {
    getCareEpisodeVerifications: (...args: unknown[]) =>
      mockGetVerifications(...args),
    verifyCareEpisode: (...args: unknown[]) => mockVerify(...args),
    rejectCareEpisode: (...args: unknown[]) => mockReject(...args),
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
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
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const queueItem = {
  id: "e1",
  vehicleId: "v1",
  title: "Cambio de aceite",
  serviceDate: "2026-06-15T00:00:00.000Z",
  mileageIn: 18500,
  notes: "Aceite 5W30",
  vehicle: {
    licensePlate: "ABC123",
    brand: "Chevrolet",
    model: "Onix",
    manufactureYear: 2024,
  },
  owner: { firstName: "Pedro", lastName: "Gómez" },
};

let VerificationsPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  clearWorkshop();
  const mod = await import(
    "@/app/(dashboard)/atenciones/verificaciones/page"
  );
  VerificationsPage = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
  clearWorkshop();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <VerificationsPage />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Verificaciones page (iteración 2-2)", () => {
  it("sin taller seleccionado muestra la guía y NO ejecuta el GET (WORKSHOP-only)", async () => {
    renderPage();

    expect(
      await screen.findByText(
        /entrá a la sección talleres del menú/i,
      ),
    ).toBeInTheDocument();
    expect(mockGetVerifications).not.toHaveBeenCalled();
  });

  it("happy path: confirma y muestra 'Verificado por {taller}'", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    mockVerify.mockResolvedValue({ id: "e1", verification: "verified" });
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    // Datos del item en la cola.
    expect(await screen.findByText("Cambio de aceite")).toBeInTheDocument();
    expect(screen.getByText(/ABC123/)).toBeInTheDocument();
    expect(screen.getByText(/Chevrolet Onix/)).toBeInTheDocument();
    expect(screen.getByText(/Propietario: Pedro Gómez/)).toBeInTheDocument();
    expect(screen.getByText(/18[.\s]?500 km/)).toBeInTheDocument();
    expect(screen.getByText("Aceite 5W30")).toBeInTheDocument();
    expect(
      screen.getByText("Pendiente de verificación"),
    ).toBeInTheDocument();

    // Confirmar abre el dialog y "Sí, confirmar" ejecuta el POST.
    await user.click(screen.getByRole("button", { name: /^confirmar$/i }));
    await user.click(
      await screen.findByRole("button", { name: /sí, confirmar/i }),
    );

    expect(await screen.findByText(/Verificado por Lubricentro Central/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /confirmar/i }),
    ).not.toBeInTheDocument();
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledWith("e1");
    expect(mockGetVerifications).toHaveBeenCalledTimes(1);
  });

  it("cancelar el dialog NO llama a verify ni cambia el estado", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^confirmar$/i }));
    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(mockVerify).not.toHaveBeenCalled();
    expect(screen.getByText("Pendiente de verificación")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /confirmar/i }),
    ).toBeInTheDocument();
  });

  it("cada card ofrece 'Ver detalle' con deep-link al episodio del vehículo", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    selectWorkshop("w1");

    renderPage();

    const detailLink = await screen.findByRole("link", {
      name: /ver detalle de cambio de aceite/i,
    });
    expect(detailLink).toHaveAttribute(
      "href",
      "/vehicles/v1/servicios/e1",
    );
    // El detalle no reemplaza la acción de confirmación.
    expect(
      screen.getByRole("button", { name: /^confirmar$/i }),
    ).toBeInTheDocument();
  });

  it("empty state: 'Sin verificaciones pendientes'", async () => {
    mockGetVerifications.mockResolvedValue([]);
    selectWorkshop("w1");

    renderPage();

    expect(
      await screen.findByText("Sin verificaciones pendientes"),
    ).toBeInTheDocument();
  });

  it("error de carga + Reintentar corren el refetch y recuperan la cola", async () => {
    mockGetVerifications
      .mockRejectedValueOnce({ status: 500, message: "Internal" })
      .mockResolvedValueOnce([queueItem]);
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText(/no se pudieron cargar las verificaciones/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(
      await screen.findByText("Cambio de aceite"),
    ).toBeInTheDocument();
    expect(mockGetVerifications).toHaveBeenCalledTimes(2);
  });

  it("409 del verify avisa 'ya fue verificado por otro taller' y mantiene el item", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    mockVerify.mockRejectedValueOnce({
      status: 409,
      message: "CARE_EPISODE_ALREADY_VERIFIED",
    });
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^confirmar$/i }));
    await user.click(
      await screen.findByRole("button", { name: /sí, confirmar/i }),
    );

    expect(
      await screen.findByText(
        /este episodio ya fue verificado por otro taller/i,
      ),
    ).toBeInTheDocument();
    // Sigue pendiente: el item mantiene su botón (podrá reintentar de forma
    // natural cuando la cola real lo cambie).
    expect(
      screen.getByRole("button", { name: /confirmar/i }),
    ).toBeInTheDocument();
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });

  it("mapea 404 del verify a 'ya no está disponible'", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    mockVerify.mockRejectedValueOnce({ status: 404, message: "Not found" });
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^confirmar$/i }));
    await user.click(
      await screen.findByRole("button", { name: /sí, confirmar/i }),
    );

    expect(
      await screen.findByText(/el episodio ya no está disponible para tu taller/i),
    ).toBeInTheDocument();
  });

  it("mapea 403 del verify a mensaje de permisos / episodio de taller", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    mockVerify.mockRejectedValueOnce({ status: 403, message: "Forbidden" });
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^confirmar$/i }));
    await user.click(
      await screen.findByRole("button", { name: /sí, confirmar/i }),
    );

    expect(
      await screen.findByText(
        /no tenés permisos o es un episodio de taller/i,
      ),
    ).toBeInTheDocument();
  });

  // ── Rechazo de verificación (diseño aprobado) ──────────────────────────────

  it("rechazar: dialog con motivo → POST reject → badge 'Rechazado' + invalidación", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    mockReject.mockResolvedValue({
      id: "e1",
      verification: "rejected",
      rejectedByMemberId: "m1",
      rejectedAt: "2026-06-15T12:00:00.000Z",
      rejectionReason: "No consta en nuestros registros",
    });
    selectWorkshop("w1");

    const user = userEvent.setup();
    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    expect(await screen.findByText("Cambio de aceite")).toBeInTheDocument();
    expect(screen.getByText("Pendiente de verificación")).toBeInTheDocument();
    // "Confirmar" sigue disponible junto a "Rechazar".
    expect(
      screen.getByRole("button", { name: /^confirmar$/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^rechazar$/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Rechazar registro");
    expect(dialog).toHaveTextContent(/no realizó «Cambio de aceite»/);

    await user.type(
      screen.getByLabelText(/motivo \(opcional\)/i),
      "No consta en nuestros registros",
    );
    await user.click(screen.getByRole("button", { name: /sí, rechazar/i }));

    expect(mockReject).toHaveBeenCalledTimes(1);
    expect(mockReject).toHaveBeenCalledWith(
      "e1",
      "No consta en nuestros registros",
    );

    // Badge "Rechazado" (destructive) — nunca "Pendiente de verificación".
    expect(await screen.findByTestId("rejected-e1")).toBeInTheDocument();
    expect(screen.getByText("Rechazado")).toBeInTheDocument();
    expect(
      screen.queryByText("Pendiente de verificación"),
    ).not.toBeInTheDocument();
    // Las acciones desaparecen tras el rechazo; "Confirmar" ya no aplica.
    expect(
      screen.queryByRole("button", { name: /^confirmar$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^rechazar$/i }),
    ).not.toBeInTheDocument();

    // Invalidación de cola + listado + detalle + historial del vehículo.
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["care-episode-verifications"],
      });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["care-episode-list"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["care-episode"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["vehicle", "v1", "history"],
    });
    // La invalidación de la cola activa provoca el refetch (2do GET).
    await waitFor(() => {
      expect(mockGetVerifications).toHaveBeenCalledTimes(2);
    });
  });

  it("rechazar sin motivo envía reason undefined (body opcional)", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    mockReject.mockResolvedValue({
      id: "e1",
      verification: "rejected",
      rejectedByMemberId: "m1",
      rejectedAt: "2026-06-15T12:00:00.000Z",
      rejectionReason: null,
    });
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^rechazar$/i }));
    await user.click(
      await screen.findByRole("button", { name: /sí, rechazar/i }),
    );

    expect(await screen.findByTestId("rejected-e1")).toBeInTheDocument();
    expect(mockReject).toHaveBeenCalledWith("e1", undefined);
  });

  it("cancelar el dialog de rechazo NO llama a reject ni cambia el estado", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^rechazar$/i }));
    await user.click(await screen.findByRole("button", { name: /cancelar/i }));

    expect(mockReject).not.toHaveBeenCalled();
    expect(screen.getByText("Pendiente de verificación")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^confirmar$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^rechazar$/i }),
    ).toBeInTheDocument();
  });

  it.each([
    [403, /no tenés permisos o es un episodio de taller/i],
    [404, /el episodio ya no está disponible para tu taller/i],
    [409, /este episodio ya fue resuelto y no se puede rechazar/i],
  ])(
    "mapea %i del reject a su mensaje y mantiene el item pendiente",
    async (status, messagePattern) => {
      mockGetVerifications.mockResolvedValue([queueItem]);
      mockReject.mockRejectedValueOnce({ status, message: "error" });
      selectWorkshop("w1");

      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole("button", { name: /^rechazar$/i }),
      );
      await user.click(
        await screen.findByRole("button", { name: /sí, rechazar/i }),
      );

      expect(await screen.findByText(messagePattern)).toBeInTheDocument();
      // Sigue pendiente: badge y acciones originales intactos.
      expect(screen.getByText("Pendiente de verificación")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^confirmar$/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^rechazar$/i }),
      ).toBeInTheDocument();
      expect(mockReject).toHaveBeenCalledTimes(1);
    },
  );

  it("un rechazo exitoso NO rompe el flujo de Confirmar (verify sigue operativo)", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    mockReject.mockResolvedValue({
      id: "e1",
      verification: "rejected",
      rejectedByMemberId: "m1",
      rejectedAt: "2026-06-15T12:00:00.000Z",
      rejectionReason: null,
    });
    mockVerify.mockResolvedValue({ id: "e1", verification: "verified" });
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    // Confirmar funciona en un item distinto de la cola.
    const secondItem = { ...queueItem, id: "e2", title: "Cambio de filtro" };
    mockGetVerifications.mockResolvedValue([queueItem, secondItem]);

    await user.click(await screen.findByRole("button", { name: /^rechazar$/i }));
    await user.click(
      await screen.findByRole("button", { name: /sí, rechazar/i }),
    );
    expect(await screen.findByTestId("rejected-e1")).toBeInTheDocument();

    // El segundo item mantiene ambas acciones.
    expect(
      screen.getByRole("button", { name: /^confirmar$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^rechazar$/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^confirmar$/i }));
    await user.click(
      await screen.findByRole("button", { name: /sí, confirmar/i }),
    );

    expect(await screen.findByText(/Verificado por Lubricentro Central/)).toBeInTheDocument();
    expect(mockVerify).toHaveBeenCalledWith("e2");
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });
});