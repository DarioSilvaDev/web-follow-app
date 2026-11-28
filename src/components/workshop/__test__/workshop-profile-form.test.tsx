/**
 * Tests del rediseño UX del perfil del taller (etapas 0-2 del handoff):
 * secciones, chip "opcional", contador, feedback al blur y estado de guardado.
 *
 * No se testea la API en sí: se mockea `updateWorkshop` y se verifica el payload
 * que sale del componente (sin inventar campos ni normalizar el CUIT).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { WorkshopProfileForm } from "@/components/workshop/workshop-profile-form";
import type { WorkshopDetail } from "@/types/workshop";

const mockUpdate = vi.fn();

vi.mock("@/lib/api", () => ({
  workshopApi: {
    updateWorkshop: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/components/onboarding/tour-launcher", () => ({
  TourLauncher: () => null,
}));

const DESCRIPTION =
  "Somos los mejores en mecanica general. Trabajamos con vehículos a combustion, híbridos y eléctricos";

const workshop: WorkshopDetail = {
  id: "w1",
  name: "Lo de Darío",
  legalName: "Dario Silva",
  taxId: "30123456781",
  email: "dario@example.com",
  phone: "+543364687486",
  website: null,
  logoUrl: null,
  description: DESCRIPTION,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkshopProfileForm workshop={workshop} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorkshopProfileForm — rediseño UX", () => {
  it("muestra las tres secciones y marca como opcionales los 6 campos no obligatorios", () => {
    renderForm();

    for (const title of ["Identidad", "Contacto", "Presencia online"]) {
      expect(
        screen.getByRole("heading", { level: 3, name: title }),
      ).toBeInTheDocument();
    }
    expect(screen.getAllByText("(opcional)")).toHaveLength(6);
  });

  it("muestra el contador de descripción y lo actualiza al escribir", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(
      screen.getByText(`${DESCRIPTION.length}/200`),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/descripción/i), "!");
    expect(screen.getByText(`${DESCRIPTION.length + 1}/200`)).toBeInTheDocument();
  });

  it("Guardar arranca deshabilitado y se habilita cuando hay cambios", async () => {
    const user = userEvent.setup();
    renderForm();

    const save = screen.getByRole("button", { name: /guardar cambios/i });
    expect(save).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Sin cambios");

    await user.type(screen.getByLabelText(/^nombre/i), "!");
    expect(screen.getByRole("status")).toHaveTextContent("Cambios sin guardar");
    expect(save).toBeEnabled();
  });

  it("valida el email al salir del campo (blur), no mientras se escribe", async () => {
    const user = userEvent.setup();
    renderForm();

    const email = screen.getByLabelText(/^email/i);
    await user.clear(email);
    // El campo es opcional: vacío es válido. Se necesita un valor inválido.
    await user.type(email, "no-es-email");
    expect(screen.queryByText("Ingresá un email válido.")).not.toBeInTheDocument();

    await user.tab();
    expect(
      await screen.findByText("Ingresá un email válido."),
    ).toBeInTheDocument();
  });

  it("guarda con el payload de 7 campos y muestra el banner de éxito", async () => {
    const user = userEvent.setup();
    mockUpdate.mockResolvedValue({ id: "w1" });
    renderForm();

    await user.type(screen.getByLabelText(/^nombre/i), "!");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    const [id, payload] = mockUpdate.mock.calls[0];
    expect(id).toBe("w1");
    expect(payload).toEqual({
      name: "Lo de Darío!",
      legalName: "Dario Silva",
      // Sin normalizar (BE-005 sigue siendo un bug del backend).
      taxId: "30-12345678-1",
      email: "dario@example.com",
      phone: "+543364687486",
      website: null,
      description: DESCRIPTION,
    });
    expect(
      await screen.findByText("Los datos del taller se actualizaron."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeDisabled();
  });
});
