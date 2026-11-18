/**
 * Tests for the "Nueva atención" page — check-in unificado de taller (B-2).
 *
 * Behaviors cubiertos:
 * - Sin taller seleccionado → guidance state (WORKSHOP-only).
 * - Lookup por patente: encontrado (rama reutilizar), no encontrado (rama crear),
 *   429 / 5xx / red → copy único + Reintentar, nunca ofrecer crear.
 * - Rama reutilizar: card "Encontramos el vehículo" + botón explícito de
 *   continuar; el payload NO lleva datos de vehículo.
 * - Rama crear: copy exacto del AC, patente read-only, catálogo XOR texto libre
 *   POR CAMPO (brandId de catálogo + modelName "Otro modelo").
 * - Odómetro: XOR valor numérico / excepción "no legible" + motivo.
 * - Tipos de atención: tope 3 + "Otro" con texto libre; aviso de onboarding.
 * - Celular del propietario: par área/número, "No disponible" omite el campo.
 * - Errores: 409 vehículo dado de baja (conserva form + foco en patente),
 *   400 de VIN (error en el campo), 403 de permisos.
 * - Éxito con excepción de odómetro: bloquea "Finalizar" hasta subir 1 foto
 *   "before"; escape "Cargarla después desde la atención" si falla la subida.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearWorkshop, selectWorkshop } from "@/lib/active-context";
import { CHECK_IN_MESSAGES } from "@/lib/check-in-errors";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockLookup = vi.fn();
const mockCheckIn = vi.fn();
const mockListServiceTypes = vi.fn();
const mockListBrands = vi.fn();
const mockListModels = vi.fn();
const mockGetWorkshop = vi.fn();
const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
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

// Membresía presente para que el guard de membresía NO redirija.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "u1",
      workshopMemberships: [
        {
          workshopId: "w1",
          workshop: { id: "w1", name: "Taller Mecánico Central" },
          role: "Owner",
        },
      ],
    },
  }),
}));

vi.mock("@/lib/api", () => ({
  careEpisodeApi: {
    lookupVehicleByPlate: (...args: unknown[]) => mockLookup(...args),
    checkIn: (...args: unknown[]) => mockCheckIn(...args),
    listServiceTypes: (...args: unknown[]) => mockListServiceTypes(...args),
  },
  workshopApi: {
    getWorkshop: (...args: unknown[]) => mockGetWorkshop(...args),
  },
  vehicleApi: {
    listBrands: (...args: unknown[]) => mockListBrands(...args),
    listModels: (...args: unknown[]) => mockListModels(...args),
  },
}));

// Mock UI components to avoid deep dependency trees (existing convention).
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    className: _className,
    ...props
  }: React.ComponentProps<"button"> & {
    variant?: string;
    size?: string;
  }) => <button {...props}>{children}</button>,
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
  // Espejo del `sanitize` de la implementación real (ver components/ui/input).
  Input: ({
    sanitize,
    onChange,
    ...props
  }: React.ComponentProps<"input"> & { sanitize?: "digits" }) => (
    <input
      {...props}
      onChange={(event) => {
        if (sanitize === "digits") {
          event.target.value = event.target.value.replace(/\D/g, "");
        }
        onChange?.(event);
      }}
    />
  ),
}));
vi.mock("@/components/ui/label", () => ({
  Label: (props: React.ComponentProps<"label">) => <label {...props} />,
}));
vi.mock("@/components/ui/select", () => ({
  Select: (props: React.ComponentProps<"select">) => <select {...props} />,
}));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.ComponentProps<"textarea">) => <textarea {...props} />,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
}));
vi.mock("@/components/ui/callout", () => ({
  Callout: ({
    children,
    variant: _variant,
    icon: _icon,
    role = "status",
    ...props
  }: React.ComponentProps<"div"> & {
    variant?: string;
    icon?: unknown;
  }) => (
    <div role={role} {...props}>
      {children}
    </div>
  ),
}));

// Uploader: expone botones para simular éxito/fallo sin red real.
vi.mock("@/components/care-episode/attachments-uploader", () => ({
  AttachmentsUploader: ({
    onUploaded,
    onUploadError,
  }: {
    onUploaded?: (attachment: { id: string; phase: string }) => void;
    onUploadError?: (error: unknown) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onUploaded?.({ id: "a1", phase: "before" })}
      >
        Simular foto antes
      </button>
      <button type="button" onClick={() => onUploadError?.(new Error("boom"))}>
        Simular fallo de subida
      </button>
    </div>
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeWorkshop() {
  return {
    id: "w1",
    name: "Taller Mecánico Central",
    branches: [
      {
        id: "b1",
        workshopId: "w1",
        name: "Sucursal Norte",
        phone: null,
        isHeadquarters: true,
        isActive: true,
      },
      {
        id: "b2",
        workshopId: "w1",
        name: "Sucursal Sur",
        phone: null,
        isHeadquarters: false,
        isActive: true,
      },
    ],
  };
}

function makeVehicle(plate = "ABC123") {
  return {
    id: "v1",
    licensePlate: plate,
    brand: "Toyota",
    model: "Corolla",
    manufactureYear: 2020,
    modelYear: 2021,
  };
}

function makeServiceTypes() {
  return [
    { id: "st1", code: "maintenance", name: "Mantenimiento" },
    { id: "st2", code: "brakes", name: "Frenos" },
    { id: "st3", code: "alignment", name: "Alineación" },
    { id: "st4", code: "electrical", name: "Eléctrico" },
  ];
}

function makeCheckInResult(
  overrides: Record<string, unknown> = {},
): { data: Record<string, unknown> } {
  return {
    data: {
      careEpisodeId: "e1",
      vehicleId: "v1",
      licensePlate: "ABC123",
      status: "open",
      mileageIn: 50000,
      checkedInAt: "2026-11-11T15:00:00.000Z",
      vehicleCreated: false,
      ownerContact: { status: "available", phoneMasked: "••••2268" },
      ...overrides,
    },
  };
}

let NewCareEpisodePage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  clearWorkshop();
  mockGetWorkshop.mockResolvedValue(makeWorkshop());
  mockListServiceTypes.mockResolvedValue({
    data: makeServiceTypes(),
    onboardingRequired: false,
  });
  mockListBrands.mockResolvedValue([]);
  mockListModels.mockResolvedValue([]);

  // Dynamic import ensures mocks are resolved first
  const mod = await import("@/app/(dashboard)/atenciones/nueva/page");
  NewCareEpisodePage = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
  clearWorkshop();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <NewCareEpisodePage />
    </QueryClientProvider>,
  );
  return { invalidateSpy };
}

type User = ReturnType<typeof userEvent.setup>;

async function searchPlate(user: User, plate: string) {
  await user.type(screen.getByLabelText(/patente del vehículo/i), plate);
  await user.click(screen.getByRole("button", { name: /buscar/i }));
}

/** Click en el trigger de una sección (abre/cierra). */
async function toggleSection(user: User, name: RegExp) {
  await user.click(screen.getByRole("button", { name }));
}

/** Lookup encontrado → confirmar card y esperar a que carguen sucursales. */
async function continueWithFoundVehicle(user: User, plate = "ABC123") {
  mockLookup.mockResolvedValue(makeVehicle(plate));
  await searchPlate(user, plate);
  await screen.findByTestId("vehicle-found");
  await user.click(
    screen.getByRole("button", { name: /continuar con el check-in/i }),
  );
  // Las secciones arrancan cerradas: abrir "Datos de ingreso" para ver la
  // sucursal y los campos del vehículo.
  await toggleSection(user, /^datos de ingreso/i);
  await screen.findByRole("option", { name: /Sucursal Norte/ });
}

async function submitCheckIn(user: User) {
  await user.click(
    screen.getByRole("button", { name: /registrar atención/i }),
  );
}

/** Completa los campos ahora obligatorios: tipo de atención, motivo/queja
 *  y contacto («No disponible»). Deja la vista en la sección de datos. */
async function fillRequiredDetails(user: User) {
  await user.click(screen.getByRole("button", { name: /tipo de servicio/i }));
  await user.click(screen.getByRole("button", { name: "Mantenimiento" }));
  await user.click(screen.getByRole("button", { name: /observaciones/i }));
  await user.type(
    screen.getByLabelText(/motivo \/ queja del cliente/i),
    "Ruido en el motor",
  );
  await user.click(screen.getByRole("button", { name: /contacto/i }));
  await user.click(screen.getByLabelText(/^no disponible$/i));
  await user.click(
    screen.getByRole("button", { name: /datos de ingreso/i }),
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Nueva atención page — check-in unificado (B-2)", () => {
  it("shows guidance when no workshop is selected (WORKSHOP-only)", async () => {
    renderPage();

    expect(
      await screen.findByText(/entrá a la sección talleres del menú/i),
    ).toBeInTheDocument();
    expect(mockLookup).not.toHaveBeenCalled();
    expect(mockGetWorkshop).not.toHaveBeenCalled();
  });

  it("rama reutilizar: confirma el vehículo y hace check-in por patente", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockCheckIn.mockResolvedValue(makeCheckInResult());

    const { invalidateSpy } = renderPage();

    mockLookup.mockResolvedValue(makeVehicle());
    await searchPlate(user, "abc123");

    // Card "Encontramos el vehículo" con resumen de catálogo.
    expect(await screen.findByTestId("vehicle-found")).toBeInTheDocument();
    expect(screen.getByText("Encontramos el vehículo")).toBeInTheDocument();
    expect(
      screen.getByText("Toyota Corolla — 2020 / 2021"),
    ).toBeInTheDocument();
    expect(mockLookup).toHaveBeenCalledWith("ABC123");

    // El formulario NO se muestra hasta confirmar explícitamente.
    expect(
      screen.queryByRole("button", { name: /registrar atención/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /continuar con el check-in/i }),
    );
    await toggleSection(user, /^datos de ingreso/i);
    await screen.findByRole("option", { name: /Sucursal Norte/ });

    await user.type(screen.getByLabelText(/kilometraje/i), "50000");
    await fillRequiredDetails(user);
    await submitCheckIn(user);

    expect(
      await screen.findByText(/Atención ingresada — ABC123/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Atención sobre el vehículo ya registrado."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Contacto: ••••2268/)).toBeInTheDocument();

    // Payload por PATENTE, sin datos de vehículo en la rama reutilizar.
    expect(mockCheckIn).toHaveBeenCalledWith({
      licensePlate: "ABC123",
      branchId: "b1",
      mileageIn: 50000,
      serviceTypeIds: ["st1"],
      customerComplaint: "Ruido en el motor",
    });

    // Invalidaciones: listado del taller + historia del vehículo + detalle.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["care-episode-list", "w1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["vehicle", "v1", "history"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["care-episode", "e1"],
    });

    // CTAs de éxito.
    expect(screen.getByRole("link", { name: /ver atención/i })).toHaveAttribute(
      "href",
      "/vehicles/v1/servicios/e1",
    );
    expect(
      screen.getByRole("link", { name: /cargar fotos de ingreso/i }),
    ).toHaveAttribute("href", "#evidencia-ingreso");
  });

  it("rama crear: 404 muestra el copy exacto y registra vehículo nuevo", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockLookup.mockRejectedValue({
      status: 404,
      message: "Vehicle not found",
      code: "VEHICLE_NOT_FOUND",
    });
    mockListBrands.mockResolvedValue([{ id: "br1", name: "Toyota" }]);
    mockListModels.mockResolvedValue([
      { id: "mo1", brandId: "br1", name: "Corolla" },
    ]);
    mockCheckIn.mockResolvedValue(
      makeCheckInResult({
        licensePlate: "XYZ999",
        vehicleCreated: true,
        ownerContact: { status: "unavailable", phoneMasked: null },
      }),
    );

    renderPage();

    await searchPlate(user, "xyz999");

    // Copy exacto del AC.
    expect(
      await screen.findByText(
        "No encontramos la patente XYZ999. Lo registramos como vehículo nuevo.",
      ),
    ).toBeInTheDocument();

    // Secciones arrancan cerradas: abrir "Datos de ingreso".
    await toggleSection(user, /^datos de ingreso/i);

    // Patente pre-cargada y read-only.
    const plateField = screen.getByTestId("check-in-plate");
    expect(plateField).toHaveValue("XYZ999");
    expect(plateField).toHaveAttribute("readonly");

    await screen.findByRole("option", { name: /Sucursal Norte/ });

    // Marca desde catálogo (brandId) …
    await user.selectOptions(
      screen.getByLabelText(/marca \(opcional\)/i),
      "br1",
    );
    // … modelo "Otro modelo" (texto libre, modelName).
    await screen.findByRole("option", { name: "Corolla" });
    await user.selectOptions(
      screen.getByLabelText(/modelo \(opcional\)/i),
      "__other__",
    );
    await user.type(screen.getByLabelText(/escribí el modelo/i), "Uno");

    await user.type(screen.getByLabelText(/kilometraje/i), "30000");
    await fillRequiredDetails(user);
    await submitCheckIn(user);

    expect(
      await screen.findByText(/Atención ingresada — XYZ999/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Registramos el vehículo en la plataforma."),
    ).toBeInTheDocument();
    expect(screen.getByText("Sin canal de reclamo")).toBeInTheDocument();

    // XOR por campo: brandId de catálogo + modelName libre (nunca ambos).
    expect(mockCheckIn).toHaveBeenCalledWith({
      licensePlate: "XYZ999",
      branchId: "b1",
      brandId: "br1",
      modelName: "Uno",
      mileageIn: 30000,
      serviceTypeIds: ["st1"],
      customerComplaint: "Ruido en el motor",
    });
  });

  it("lookup 5xx: copy único + Reintentar, nunca ofrece crear", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockLookup.mockRejectedValueOnce({ status: 500, message: "Internal" });
    mockLookup.mockResolvedValueOnce(makeVehicle());

    renderPage();
    await searchPlate(user, "ABC123");

    expect(
      await screen.findByText(
        "No pudimos buscar la patente. Intentalo de nuevo.",
      ),
    ).toBeInTheDocument();
    // Sin formulario de alta ni copy de "vehículo nuevo".
    expect(
      screen.queryByText(/lo registramos como vehículo nuevo/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /registrar atención/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(await screen.findByTestId("vehicle-found")).toBeInTheDocument();
    expect(mockLookup).toHaveBeenCalledTimes(2);
  });

  it("lookup 429: mismo copy + detalle de rate limit", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockLookup.mockRejectedValue({
      status: 429,
      message: "ThrottlerException: Too Many Requests",
    });

    renderPage();
    await searchPlate(user, "ABC123");

    expect(
      await screen.findByText(
        "No pudimos buscar la patente. Intentalo de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Demasiadas búsquedas\. Esperá unos segundos/i),
    ).toBeInTheDocument();
    expect(mockCheckIn).not.toHaveBeenCalled();
  });

  it("409 vehículo dado de baja: conserva el formulario y enfoca la patente", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockCheckIn.mockRejectedValue({
      status: 409,
      message: "El vehículo está dado de baja; contactá a soporte",
    });

    renderPage();
    await continueWithFoundVehicle(user);

    await user.type(screen.getByLabelText(/kilometraje/i), "50000");
    await fillRequiredDetails(user);
    await submitCheckIn(user);

    expect(
      await screen.findByText(CHECK_IN_MESSAGES.vehicleDeleted),
    ).toBeInTheDocument();
    // Formulario preservado (no se resetea ni navega) y foco en la patente.
    expect(screen.getByLabelText(/kilometraje/i)).toHaveValue("50000");
    expect(screen.getByLabelText(/patente del vehículo/i)).toHaveFocus();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("409 VIN ya registrado: error en el campo VIN (rama crear)", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockLookup.mockRejectedValue({ status: 404, message: "not found" });
    mockCheckIn.mockRejectedValue({
      status: 409,
      message: "VIN ya registrado en otro vehículo",
    });

    renderPage();
    await searchPlate(user, "XYZ999");
    await toggleSection(user, /^datos de ingreso/i);
    await screen.findByRole("option", { name: /Sucursal Norte/ });

    await user.type(screen.getByLabelText(/kilometraje/i), "30000");
    await fillRequiredDetails(user);
    await submitCheckIn(user);

    expect(
      await screen.findByText(CHECK_IN_MESSAGES.vinOtherVehicle),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("400 del backend: ubica el error en el campo (VIN)", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockLookup.mockRejectedValue({ status: 404, message: "not found" });
    mockCheckIn.mockRejectedValue({
      status: 400,
      message: "El VIN no es válido",
    });

    renderPage();
    await searchPlate(user, "XYZ999");
    await toggleSection(user, /^datos de ingreso/i);
    await screen.findByRole("option", { name: /Sucursal Norte/ });

    await user.type(screen.getByLabelText(/kilometraje/i), "30000");
    await fillRequiredDetails(user);
    await submitCheckIn(user);

    expect(
      await screen.findByText("El VIN tiene 17 caracteres, sin I, O ni Q."),
    ).toBeInTheDocument();
  });

  it("403: muestra el mensaje de permisos", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockCheckIn.mockRejectedValue({ status: 403, message: "Forbidden" });

    renderPage();
    await continueWithFoundVehicle(user);

    await user.type(screen.getByLabelText(/kilometraje/i), "50000");
    await fillRequiredDetails(user);
    await submitCheckIn(user);

    expect(
      await screen.findByText(CHECK_IN_MESSAGES.permissions),
    ).toBeInTheDocument();
  });

  it("odómetro no legible: XOR, bloqueo de Finalizar y desbloqueo con foto", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockCheckIn.mockResolvedValue(
      makeCheckInResult({ mileageIn: null }),
    );

    renderPage();
    await continueWithFoundVehicle(user);

    // Excepción: el input numérico queda deshabilitado y se pide motivo.
    await user.click(screen.getByLabelText(/no se puede leer el odómetro/i));
    expect(screen.getByLabelText(/kilometraje/i)).toBeDisabled();

    const reasonField = screen.getByLabelText(
      /motivo \(mínimo 3 caracteres\)/i,
    );
    await user.type(reasonField, "Tablero roto");
    expect(reasonField).toHaveValue("Tablero roto");
    await fillRequiredDetails(user);
    await submitCheckIn(user);

    expect(
      await screen.findByText(/Atención ingresada — ABC123/),
    ).toBeInTheDocument();
    expect(mockCheckIn).toHaveBeenCalledWith({
      licensePlate: "ABC123",
      branchId: "b1",
      mileageInUnreadable: true,
      mileageInUnreadableReason: "Tablero roto",
      serviceTypeIds: ["st1"],
      customerComplaint: "Ruido en el motor",
    });

    // La foto del tablero es obligatoria: Finalizar bloqueado.
    expect(
      screen.getByText(
        "Falta la foto del tablero: es obligatoria cuando el odómetro no se puede leer.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /finalizar/i }),
    ).toBeDisabled();

    // Subir 1 foto "before" desbloquea.
    await user.click(
      screen.getByRole("button", { name: /simular foto antes/i }),
    );
    expect(
      screen.getByRole("button", { name: /finalizar/i }),
    ).toBeEnabled();
    expect(
      screen.queryByText(/falta la foto del tablero/i),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /finalizar/i }));
    expect(mockPush).toHaveBeenCalledWith("/atenciones");
  });

  it("odómetro no legible: escape si falla la subida (nunca dead end)", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockCheckIn.mockResolvedValue(makeCheckInResult({ mileageIn: null }));

    renderPage();
    await continueWithFoundVehicle(user);

    await user.click(screen.getByLabelText(/no se puede leer el odómetro/i));
    await user.type(
      screen.getByLabelText(/motivo \(mínimo 3 caracteres\)/i),
      "Tablero roto",
    );
    await fillRequiredDetails(user);
    await submitCheckIn(user);
    await screen.findByText(/Atención ingresada — ABC123/);

    // Fallo de subida → aparece la salida explícita.
    await user.click(
      screen.getByRole("button", { name: /simular fallo de subida/i }),
    );
    const escape = await screen.findByRole("button", {
      name: /cargarla después desde la atención/i,
    });
    expect(
      screen.getByRole("button", { name: /finalizar/i }),
    ).toBeDisabled();

    await user.click(escape);

    // Aviso persistente + Finalizar habilitado.
    expect(
      screen.getByText(/la foto del tablero quedó pendiente/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /finalizar/i }),
    ).toBeEnabled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("tipos de atención: máximo 3 y 'Otro' con texto libre", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockCheckIn.mockResolvedValue(makeCheckInResult());

    renderPage();
    await continueWithFoundVehicle(user);

    await user.click(screen.getByRole("button", { name: /tipo de servicio/i }));
    const group = await screen.findByRole("group", {
      name: /tipos de atención/i,
    });
    expect(group).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mantenimiento" }));
    await user.click(screen.getByRole("button", { name: "Frenos" }));
    await user.click(screen.getByRole("button", { name: "Alineación" }));

    // El cuarto (catálogo o "Otro") queda bloqueado con el copy del tope.
    await user.click(screen.getByRole("button", { name: "Otro" }));
    expect(
      screen
        .getAllByRole("alert")
        .some(
          (node) =>
            node.textContent?.trim() === CHECK_IN_MESSAGES.serviceTypesMax,
        ),
    ).toBe(true);

    // Deseleccionar uno habilita "Otro" + texto libre.
    await user.click(screen.getByRole("button", { name: "Frenos" }));
    await user.click(screen.getByRole("button", { name: "Otro" }));
    await user.type(
      screen.getByLabelText(/otro tipo de atención/i),
      "Chapa y pintura",
    );

    await user.click(
      screen.getByRole("button", { name: /datos de ingreso/i }),
    );
    await user.type(screen.getByLabelText(/kilometraje/i), "50000");
    await user.click(
      screen.getByRole("button", { name: /observaciones/i }),
    );
    await user.type(
      screen.getByLabelText(/motivo \/ queja del cliente/i),
      "Ruido en el motor",
    );
    await user.click(screen.getByRole("button", { name: /contacto/i }));
    await user.click(screen.getByLabelText(/^no disponible$/i));
    await user.click(
      screen.getByRole("button", { name: /datos de ingreso/i }),
    );
    await submitCheckIn(user);

    await screen.findByText(/Atención ingresada — ABC123/);
    expect(mockCheckIn).toHaveBeenCalledWith({
      licensePlate: "ABC123",
      branchId: "b1",
      mileageIn: 50000,
      serviceTypeIds: ["st1", "st3"],
      customServiceLabel: "Chapa y pintura",
      customerComplaint: "Ruido en el motor",
    });
  });

  it("onboarding: aviso no bloqueante con link a Mi taller", async () => {
    selectWorkshop("w1");
    mockListServiceTypes.mockResolvedValue({
      data: makeServiceTypes(),
      onboardingRequired: true,
    });

    const user = userEvent.setup();
    mockLookup.mockResolvedValue(makeVehicle());

    renderPage();
    await searchPlate(user, "ABC123");
    await screen.findByTestId("vehicle-found");
    await user.click(
      screen.getByRole("button", { name: /continuar con el check-in/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /tipo de servicio/i }),
    );

    expect(
      await screen.findByText(/todavía no cargó especialidades/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mi taller/i })).toHaveAttribute(
      "href",
      "/workshops/w1",
    );
    // No bloquea: el submit sigue disponible.
    expect(
      screen.getByRole("button", { name: /registrar atención/i }),
    ).toBeEnabled();
  });

  it("celular del propietario: par incompleto bloquea, 'No disponible' lo omite", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockCheckIn.mockResolvedValue(
      makeCheckInResult({
        ownerContact: { status: "unavailable", phoneMasked: null },
      }),
    );

    renderPage();
    await continueWithFoundVehicle(user);

    await user.type(screen.getByLabelText(/kilometraje/i), "50000");

    // Completa los otros obligatorios (tipos + motivo/queja) sin tocar Contacto.
    await user.click(
      screen.getByRole("button", { name: /tipo de servicio/i }),
    );
    await user.click(screen.getByRole("button", { name: "Mantenimiento" }));
    await user.click(
      screen.getByRole("button", { name: /observaciones/i }),
    );
    await user.type(
      screen.getByLabelText(/motivo \/ queja del cliente/i),
      "Ruido en el motor",
    );

    // Solo código de área → el par está incompleto (submit inválido cambia la
    // vista al campo con error).
    await user.click(screen.getByRole("button", { name: /contacto/i }));
    await user.type(screen.getByLabelText(/código de área/i), "11");
    await submitCheckIn(user);

    expect(
      await screen.findByText(
        "Ingresá el código de área y el número, o marcá «No disponible»",
      ),
    ).toBeInTheDocument();
    expect(mockCheckIn).not.toHaveBeenCalled();

    // "No disponible" deshabilita el par y omite `ownerPhone`.
    await user.click(screen.getByLabelText(/^no disponible$/i));
    expect(screen.getByLabelText(/código de área/i)).toBeDisabled();

    await submitCheckIn(user);
    await screen.findByText(/Atención ingresada — ABC123/);
    expect(mockCheckIn).toHaveBeenCalledWith({
      licensePlate: "ABC123",
      branchId: "b1",
      mileageIn: 50000,
      serviceTypeIds: ["st1"],
      customerComplaint: "Ruido en el motor",
    });
    expect(screen.getByText("Sin canal de reclamo")).toBeInTheDocument();
  });

  it("'Registrar otra atención' vuelve a la búsqueda por patente", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockCheckIn.mockResolvedValue(makeCheckInResult());

    renderPage();
    await continueWithFoundVehicle(user);
    await user.type(screen.getByLabelText(/kilometraje/i), "50000");
    await fillRequiredDetails(user);
    await submitCheckIn(user);
    await screen.findByText(/Atención ingresada — ABC123/);

    await user.click(
      screen.getByRole("button", { name: /registrar otra atención/i }),
    );

    expect(screen.getByLabelText(/patente del vehículo/i)).toHaveValue("");
    expect(
      screen.queryByText(/Atención ingresada — ABC123/),
    ).not.toBeInTheDocument();
    expect(mockCheckIn).toHaveBeenCalledTimes(1);
  });
});
