/**
 * Tests for MileageRegisterDialog — registro/actualización de kilometraje
 * desde el dashboard (hero del vehículo activo).
 *
 * Comportamientos críticos:
 * - Modo "register" (default, sin km): patente en la descripción, submit
 *   "Registrar kilometraje".
 * - Modo "update" (con km): descripción con el último registro formateado
 *   es-AR, submit "Actualizar kilometraje".
 * - Submit válido → vehicleApi.recordMileage(id, { mileage }), cierra el
 *   dialog e invalida la ficha + las vistas del conjunto.
 * - Validación local (misma que MileageSection): vacío/NaN/negativo → alert y
 *   NO llama a la API.
 * - Errores normalizados: 400/409 → mensaje RF-5; 403 → permiso; resto →
 *   genérico.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MileageRegisterDialog } from "@/components/vehicle/mileage-register-dialog";

const mockRecordMileage = vi.fn();

vi.mock("@/lib/api", () => ({
  vehicleApi: {
    recordMileage: (...args: unknown[]) => mockRecordMileage(...args),
  },
}));

const VEHICLE = { id: "v1", licensePlate: "ABC123" };
const RF5_MESSAGE =
  "El kilometraje debe ser mayor o igual al último registrado (RF-5).";

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof MileageRegisterDialog>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const onOpenChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MileageRegisterDialog
        open
        onOpenChange={onOpenChange}
        vehicle={VEHICLE}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onOpenChange, invalidateSpy };
}

function submitButton(name = "Registrar kilometraje") {
  return screen.getByRole("button", { name });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MileageRegisterDialog — modo register (default)", () => {
  it("muestra la patente y el campo de km (sin campo de notas)", () => {
    renderDialog();

    expect(
      screen.getByRole("heading", { name: "Registrar kilometraje" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Ingresá el kilometraje actual de ABC123/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Kilometraje (km)")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Notas/i)).not.toBeInTheDocument();
  });

  it("envía { mileage } y cierra el dialog al registrar", async () => {
    const user = userEvent.setup();
    mockRecordMileage.mockResolvedValue({ id: "m1" });
    const { onOpenChange, invalidateSpy } = renderDialog();

    await user.type(screen.getByLabelText("Kilometraje (km)"), "25100");
    await user.click(submitButton());

    await waitFor(() => {
      expect(mockRecordMileage).toHaveBeenCalledWith("v1", {
        mileage: 25100,
      });
    });
    // Sin toast: el feedback es el cierre + la ficha actualizada.
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    // La ficha (GET /:id) incluye los km; las listas/dashboard se invalidan
    // con el prefijo del conjunto.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["vehicle", "v1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["vehicles"] });
  });

  it("rechaza el kilometraje vacío sin llamar a la API", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ingresá un kilometraje válido.",
    );
    expect(mockRecordMileage).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("muestra el mensaje RF-5 cuando el backend rechaza por monotonía (400)", async () => {
    const user = userEvent.setup();
    mockRecordMileage.mockRejectedValue({
      status: 400,
      message: "Mileage must be greater than or equal to last recorded",
    });
    const { onOpenChange } = renderDialog();

    await user.type(screen.getByLabelText("Kilometraje (km)"), "1000");
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(RF5_MESSAGE);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("muestra el error de permiso cuando el backend responde 403", async () => {
    const user = userEvent.setup();
    mockRecordMileage.mockRejectedValue({
      status: 403,
      message: "Forbidden",
    });
    const { onOpenChange } = renderDialog();

    await user.type(screen.getByLabelText("Kilometraje (km)"), "25000");
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No tenés permiso para registrar kilometraje.",
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("MileageRegisterDialog — modo update", () => {
  it("muestra el último registro formateado y el submit de actualización", () => {
    renderDialog({ mode: "update", currentMileage: 42380 });

    expect(
      screen.getByRole("heading", { name: "Actualizar kilometraje" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/El último registro es 42\.380 km/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Ingresá un valor igual o mayor\./),
    ).toBeInTheDocument();
    // El microcopy de actualización no habla de "completar la ficha".
    expect(screen.queryByText(/completa la ficha/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Actualizar kilometraje" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Notas/i)).not.toBeInTheDocument();
  });

  it("envía { mileage } y cierra el dialog al actualizar", async () => {
    const user = userEvent.setup();
    mockRecordMileage.mockResolvedValue({ id: "m2" });
    const { onOpenChange, invalidateSpy } = renderDialog({
      mode: "update",
      currentMileage: 42380,
    });

    await user.type(screen.getByLabelText("Kilometraje (km)"), "43100");
    await user.click(
      screen.getByRole("button", { name: "Actualizar kilometraje" }),
    );

    await waitFor(() => {
      expect(mockRecordMileage).toHaveBeenCalledWith("v1", {
        mileage: 43100,
      });
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["vehicle", "v1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["vehicles"] });
  });

  it("input inválido → alert sin llamar a la API", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog({
      mode: "update",
      currentMileage: 42380,
    });

    await user.click(
      screen.getByRole("button", { name: "Actualizar kilometraje" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ingresá un kilometraje válido.",
    );
    expect(mockRecordMileage).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("muestra el mensaje RF-5 cuando el backend rechaza por monotonía (409)", async () => {
    const user = userEvent.setup();
    mockRecordMileage.mockRejectedValue({
      status: 409,
      message: "Mileage must be greater than or equal to last recorded",
    });
    const { onOpenChange } = renderDialog({
      mode: "update",
      currentMileage: 42380,
    });

    await user.type(screen.getByLabelText("Kilometraje (km)"), "1000");
    await user.click(
      screen.getByRole("button", { name: "Actualizar kilometraje" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(RF5_MESSAGE);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
