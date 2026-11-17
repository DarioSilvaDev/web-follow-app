/**
 * PersonalInfoCard — datos personales (lectura + edición inline).
 *
 * Fuente única: SessionUser (useAuth). Cubre:
 * - datos poblados (nombre, email, alias, estado, celular)
 * - celular: formateado desde display fields, phone crudo (legacy), vacío
 * - fallback de avatar por iniciales cuando no hay avatarUrl
 * - alias ausente ("Sin alias")
 * - SIN badges de roles (eliminados del grid)
 * - estado de carga (skeleton) y user null (no renderiza)
 * - modo edición: entrar (foco en Nombre), cancelar/Escape descarta y
 *   devuelve el foco a "Editar", guardar llama PATCH /users/me con solo los
 *   campos modificados, refreshSession() tras el guardado
 * - validación de par de celular (un solo campo) y limpieza (ambos vacíos)
 * - errores: 400 phone-like → microcopy celular; 5xx → mensaje genérico
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseAuth = vi.fn();
const mockRefreshSession = vi.fn();
const mockUpdateMyProfile = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/lib/api", () => ({
  usersApi: {
    updateMyProfile: (...args: unknown[]) => mockUpdateMyProfile(...args),
  },
}));

// Dynamic import del SUT (tras los mocks)
let PersonalInfoCard: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  mockRefreshSession.mockResolvedValue(null);
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
    phone: null,
    roles: [
      { id: "r1", type: "user", name: "Usuario" },
    ],
    workshopMemberships: [],
    dealershipMemberships: [],
    ...overrides,
  };
}

function mockAuthenticated(overrides: Record<string, unknown> = {}) {
  mockUseAuth.mockReturnValue({
    status: "authenticated",
    user: makeUser(overrides),
    refreshSession: mockRefreshSession,
  });
}

describe("PersonalInfoCard — lectura", () => {
  it("muestra nombre, email y estado de cuenta (sin badges de roles)", () => {
    mockAuthenticated();

    render(<PersonalInfoCard />);

    expect(screen.getByText("Juan Perez")).toBeInTheDocument();
    expect(screen.getByText("juan.perez@example.com")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    // Roles eliminados del grid: el badge "Usuario" no debe aparecer
    expect(screen.queryByText("Usuario")).not.toBeInTheDocument();
  });

  it("muestra el celular formateado desde los campos de display (+54 área número)", () => {
    mockAuthenticated({
      phone: "+543413750611",
      phoneAreaCode: "341",
      phoneNationalNumber: "3750611",
    });

    render(<PersonalInfoCard />);

    expect(screen.getByText("+54 341 3750611")).toBeInTheDocument();
  });

  it("muestra el phone crudo cuando faltan los campos de display (legacy)", () => {
    mockAuthenticated({ phone: "3413750611" });

    render(<PersonalInfoCard />);

    expect(screen.getByText("3413750611")).toBeInTheDocument();
  });

  it("muestra 'Sin celular' cuando no hay celular configurado", () => {
    mockAuthenticated({ phone: null });

    render(<PersonalInfoCard />);

    expect(screen.getByText("Sin celular")).toBeInTheDocument();
  });

  it("muestra el alias con @ cuando existe", () => {
    mockAuthenticated({ alias: "juan-2026" });

    render(<PersonalInfoCard />);

    expect(screen.getByText("@juan-2026")).toBeInTheDocument();
  });

  it("muestra 'Sin alias' cuando no hay alias configurado", () => {
    mockAuthenticated({ alias: null });

    render(<PersonalInfoCard />);

    expect(screen.getByText("Sin alias")).toBeInTheDocument();
  });

  it("lista membresías de taller y concesionaria cuando existen", () => {
    mockAuthenticated({
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
    });

    render(<PersonalInfoCard />);

    expect(screen.getByText("Lubricentro Central")).toBeInTheDocument();
    expect(screen.getByText("· Dueño")).toBeInTheDocument();
    expect(screen.getByText("Concesionaria Norte")).toBeInTheDocument();
    expect(screen.getByText("· Gerente")).toBeInTheDocument();
  });

  it("usa iniciales cuando no hay avatarUrl", () => {
    mockAuthenticated();

    const { container } = render(<PersonalInfoCard />);

    expect(container.querySelector(".rounded-full")).toHaveTextContent("JP");
  });

  it("muestra el skeleton mientras la sesión carga", () => {
    mockUseAuth.mockReturnValue({
      status: "loading",
      user: null,
      refreshSession: mockRefreshSession,
    });

    render(<PersonalInfoCard />);

    expect(screen.getByText("Datos personales")).toBeInTheDocument();
    expect(screen.getByText("Cargando tu información…")).toBeInTheDocument();
  });

  it("no renderiza nada cuando user es null", () => {
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      user: null,
      refreshSession: mockRefreshSession,
    });

    const { container } = render(<PersonalInfoCard />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("PersonalInfoCard — edición inline", () => {
  it("entra a edición con el botón Editar y enfoca el input Nombre", async () => {
    const user = userEvent.setup();
    mockAuthenticated();

    render(<PersonalInfoCard />);
    await user.click(
      screen.getByRole("button", { name: "Editar datos personales" }),
    );

    expect(screen.getByText("Actualizá tu nombre y tu celular.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Tu nombre")).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Editar datos personales" }),
    ).not.toBeInTheDocument();
  });

  it("Cancelar descarta los cambios y devuelve el foco al botón Editar", async () => {
    const user = userEvent.setup();
    mockAuthenticated();

    render(<PersonalInfoCard />);
    await user.click(
      screen.getByRole("button", { name: "Editar datos personales" }),
    );

    const firstName = screen.getByPlaceholderText("Tu nombre");
    await user.clear(firstName);
    await user.type(firstName, "Juan Carlos");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(mockUpdateMyProfile).not.toHaveBeenCalled();
    const editButton = screen.getByRole("button", {
      name: "Editar datos personales",
    });
    expect(editButton).toHaveFocus();

    // Reabrir: los valores descartados no persisten en el formulario
    await user.click(editButton);
    expect(screen.getByPlaceholderText("Tu nombre")).toHaveValue("Juan");
  });

  it("Escape descarta la edición y vuelve a lectura", async () => {
    const user = userEvent.setup();
    mockAuthenticated();

    render(<PersonalInfoCard />);
    await user.click(
      screen.getByRole("button", { name: "Editar datos personales" }),
    );

    await user.keyboard("{Escape}");

    expect(mockUpdateMyProfile).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Editar datos personales" }),
    ).toBeInTheDocument();
  });

  it("Guardar envía SOLO los campos modificados y refresca la sesión", async () => {
    const user = userEvent.setup();
    mockUpdateMyProfile.mockResolvedValue({
      id: "u1",
      firstName: "Juan Carlos",
      lastName: "Perez",
      phone: null,
      phoneAreaCode: "",
      phoneNationalNumber: "",
    });
    mockAuthenticated();

    render(<PersonalInfoCard />);
    await user.click(
      screen.getByRole("button", { name: "Editar datos personales" }),
    );

    const firstName = screen.getByPlaceholderText("Tu nombre");
    await user.clear(firstName);
    await user.type(firstName, "Juan Carlos");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdateMyProfile).toHaveBeenCalledWith({
      firstName: "Juan Carlos",
    });
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText("Tus datos personales se guardaron."),
    ).toBeInTheDocument();
  });

  it("Guardar con celular nuevo envía el par normalizado (strip de no-dígitos)", async () => {
    const user = userEvent.setup();
    mockUpdateMyProfile.mockResolvedValue({
      id: "u1",
      firstName: "Juan",
      lastName: "Perez",
      phone: "+543413750611",
      phoneAreaCode: "341",
      phoneNationalNumber: "3750611",
    });
    mockAuthenticated();

    render(<PersonalInfoCard />);
    await user.click(
      screen.getByRole("button", { name: "Editar datos personales" }),
    );

    await user.type(screen.getByPlaceholderText("341"), "341");
    await user.type(screen.getByPlaceholderText("3750611"), "375-0611");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdateMyProfile).toHaveBeenCalledWith({
      phone: { areaCode: "341", nationalNumber: "3750611" },
    });
    expect(mockRefreshSession).toHaveBeenCalled();
  });

  it("validación de par: un solo campo con contenido → error y no envía", async () => {
    const user = userEvent.setup();
    mockAuthenticated();

    render(<PersonalInfoCard />);
    await user.click(
      screen.getByRole("button", { name: "Editar datos personales" }),
    );

    await user.type(screen.getByPlaceholderText("341"), "341");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText(
        "Ingresá un celular válido (código de área y número).",
      ),
    ).toBeInTheDocument();
    expect(mockUpdateMyProfile).not.toHaveBeenCalled();
  });

  it("ambos campos vacíos (con celular previo) → envía phone: null para quitarlo", async () => {
    const user = userEvent.setup();
    mockUpdateMyProfile.mockResolvedValue({
      id: "u1",
      firstName: "Juan",
      lastName: "Perez",
      phone: null,
      phoneAreaCode: "",
      phoneNationalNumber: "",
    });
    mockAuthenticated({
      phone: "+543413750611",
      phoneAreaCode: "341",
      phoneNationalNumber: "3750611",
    });

    render(<PersonalInfoCard />);
    await user.click(
      screen.getByRole("button", { name: "Editar datos personales" }),
    );

    await user.clear(screen.getByPlaceholderText("341"));
    await user.clear(screen.getByPlaceholderText("3750611"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdateMyProfile).toHaveBeenCalledWith({ phone: null });
  });

  it("500 → callout destructivo genérico, el formulario queda intacto", async () => {
    const user = userEvent.setup();
    mockUpdateMyProfile.mockRejectedValue({ status: 500 });
    mockAuthenticated();

    render(<PersonalInfoCard />);
    await user.click(
      screen.getByRole("button", { name: "Editar datos personales" }),
    );

    const firstName = screen.getByPlaceholderText("Tu nombre");
    await user.clear(firstName);
    await user.type(firstName, "Juan Carlos");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText("No pudimos guardar tus datos. Intentá de nuevo."),
    ).toBeInTheDocument();
    // El formulario sigue presente con el valor tipeado
    expect(screen.getByPlaceholderText("Tu nombre")).toHaveValue("Juan Carlos");
  });

  it("400 phone-like → microcopy de celular; form intacto", async () => {
    const user = userEvent.setup();
    mockUpdateMyProfile.mockRejectedValue({
      status: 400,
      message: "Ingresá un celular válido (código de área y número)",
    });
    mockAuthenticated();

    render(<PersonalInfoCard />);
    await user.click(
      screen.getByRole("button", { name: "Editar datos personales" }),
    );

    // 34 + 37 pasan el ≥2 dígitos del cliente: el submit llega a la API
    // mockeada, que responde 400 phone-like (el backend es autoridad final).
    await user.type(screen.getByPlaceholderText("341"), "34");
    await user.type(screen.getByPlaceholderText("3750611"), "37");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText(
        "Ingresá un celular válido (código de área y número).",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Tus datos personales se guardaron."),
    ).not.toBeInTheDocument();
  });
});
