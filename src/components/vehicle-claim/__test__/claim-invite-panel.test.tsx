/**
 * Tests del panel del taller ClaimInvitePanel (F-2, copy §2).
 *
 * Cubre la presentación (mejora UX del panel "Reclamo del vehículo"):
 * - §2.1 → §2.2: generar el link muestra el callout de advertencia, el campo
 *   readonly con label ("Link de reclamo"), el QR al lado del link, las
 *   acciones y el feedback `¡Copiado!`.
 * - §2.2: error de QR (img onError) → copy mapeado §2.14 como `role="alert"`.
 * - §2.3: invite vigente → badge `Vigente` + vencimiento + QR + acciones, y
 *   SIN campo de link (el link no se vuelve a mostrar).
 *
 * La lógica de estados/mutaciones no se toca acá: sólo se validan aserciones
 * de presentación. El gate de permisos usa `canInWorkshop` real sobre
 * `workshopMemberships[].role.permissions` (contrato de /auth/me).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClaimInvitePanel } from "@/components/vehicle-claim/claim-invite-panel";
import {
  CLAIM_PANEL_ALREADY_TAKEN,
  CLAIM_PANEL_ALREADY_TAKEN_HELPER,
  CLAIM_PANEL_QR_ERROR,
} from "@/lib/vehicle-claim-errors";
import type { SessionUser } from "@/types/auth";
import type {
  WorkshopClaimCreateData,
  WorkshopClaimDetail,
  WorkshopClaimListItem,
  WorkshopClaimListResponse,
} from "@/types/vehicle-claim";

const mockListClaims = vi.fn();
const mockGetClaim = vi.fn();
const mockCreateClaim = vi.fn();

// La sesión/contexto se setean por test antes de renderizar; los factories de
// `vi.mock` sólo cierran sobre estas variables (se leen al renderizar).
let mockUser: SessionUser | null = null;
let mockActiveContext: { type: "WORKSHOP"; workshopId: string } | null = null;

vi.mock("@/lib/api", () => ({
  vehicleClaimApi: {
    listClaims: (...args: unknown[]) => mockListClaims(...args),
    getClaim: (...args: unknown[]) => mockGetClaim(...args),
    createClaim: (...args: unknown[]) => mockCreateClaim(...args),
    revokeClaim: vi.fn(),
    approveClaim: vi.fn(),
    rejectClaim: vi.fn(),
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock("@/hooks/use-active-context", () => ({
  useActiveContext: () => mockActiveContext,
}));

const LINK = "http://localhost:3000/reclamo/e2afb2e622110e44aa11bb22cc33dd44";
const QR_URL = "https://cdn.example/qr-reclamo-ABC123.png";

function makeUser(): SessionUser {
  return {
    id: "u1",
    email: "taller@ejemplo.com",
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
          permissions: [
            "vehicle-claim.list",
            "vehicle-claim.create",
            "vehicle-claim.revoke",
            "vehicle-claim.review",
          ],
        },
      },
    ],
  };
}

function makeCreateData(
  overrides: Partial<WorkshopClaimCreateData> = {},
): WorkshopClaimCreateData {
  return {
    id: "c1",
    vehicleId: "v1",
    licensePlate: "ABC123",
    status: "pending",
    link: LINK,
    whatsappUrl: "https://wa.me/5491122334455?text=hola",
    qrImageUrl: QR_URL,
    ownerPhone: "+5491122334455",
    expiresAt: "2026-11-20T10:00:00.000Z",
    createdAt: "2026-11-13T10:00:00.000Z",
    ...overrides,
  };
}

function makeListItem(): WorkshopClaimListItem {
  return {
    id: "c1",
    vehicleId: "v1",
    licensePlate: "ABC123",
    status: "pending",
    claimOutcome: null,
    ownerPhone: "+5491122334455",
    openedAt: null,
    verifiedAt: null,
    usedAt: null,
    failedAttempts: 0,
    expiresAt: "2026-11-20T10:00:00.000Z",
    createdAt: "2026-11-13T10:00:00.000Z",
    updatedAt: "2026-11-13T10:00:00.000Z",
  };
}

function makeDetail(
  overrides: Partial<WorkshopClaimDetail> = {},
): WorkshopClaimDetail {
  return {
    id: "c1",
    vehicleId: "v1",
    careEpisodeId: "e1",
    status: "pending",
    claimOutcome: null,
    ownerPhone: "+5491122334455",
    claimantUserId: null,
    openedAt: null,
    verifiedAt: null,
    usedAt: null,
    failedAttempts: 0,
    lastFailedAt: null,
    verificationLockedAt: null,
    lockoutCount: 0,
    expiresAt: "2026-11-20T10:00:00.000Z",
    blockedAt: null,
    revokedAt: null,
    revokeReason: null,
    createdAt: "2026-11-13T10:00:00.000Z",
    updatedAt: "2026-11-13T10:00:00.000Z",
    qrImageUrl: QR_URL,
    attempts: [],
    vehicle: {
      licensePlate: "ABC123",
      brand: "Toyota",
      model: "Corolla",
      manufactureYear: 2020,
    },
    ...overrides,
  };
}

function listResponse(
  items: WorkshopClaimListItem[],
): WorkshopClaimListResponse {
  return {
    data: items,
    meta: {
      total: items.length,
      page: 1,
      limit: 100,
      totalPages: 1,
      counts: {
        pending: items.length,
        verification_required: 0,
        verified: 0,
        manual_review: 0,
        claimed: 0,
        claim_blocked: 0,
        expired: 0,
        revoked: 0,
      },
    },
  };
}

function renderPanel({
  vehicleHasActiveOwner,
}: { vehicleHasActiveOwner?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClaimInvitePanel
        vehicleId="v1"
        careEpisodeId="e1"
        licensePlate="ABC123"
        workshopId="w1"
        vehicleHasActiveOwner={vehicleHasActiveOwner}
      />
    </QueryClientProvider>,
  );
}

/**
 * Tras crear el invite, el panel invalida `["vehicle-claims"]` y el backend ya
 * devuelve el invite en el listado (si no, la rama §2.1 tiene prioridad y §2.2
 * nunca se pinta — mismo orden que en producción).
 */
function primeListAfterCreate() {
  mockListClaims
    .mockResolvedValueOnce(listResponse([]))
    .mockResolvedValue(listResponse([makeListItem()]));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = makeUser();
  mockActiveContext = { type: "WORKSHOP", workshopId: "w1" };
  mockListClaims.mockResolvedValue(listResponse([]));
  mockGetClaim.mockResolvedValue(makeDetail());
  mockCreateClaim.mockResolvedValue(makeCreateData());
});

describe("ClaimInvitePanel (presentación F-2 §2.2/§2.3)", () => {
  it("§2.1 → §2.2: generar el link muestra callout, campo readonly, QR y acciones", async () => {
    const user = userEvent.setup();
    primeListAfterCreate();
    renderPanel();

    // §2.1 sin invite
    expect(
      await screen.findByText(
        "Este vehículo todavía no tiene un link de reclamo.",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Generar link de reclamo" }),
    );

    // §2.2 — callout de advertencia con el copy completo del spec
    expect(
      await screen.findByText(
        "Guardá o compartí el link ahora. Por seguridad, no se vuelve a mostrar.",
      ),
    ).toBeInTheDocument();

    // Campo link: label + readonly + valor completo (el DOM conserva la URL
    // aunque visualmente se trunque con el CSS).
    const linkField = screen.getByLabelText("Link de reclamo");
    expect(linkField).toHaveAttribute("readonly");
    expect(linkField).toHaveValue(LINK);

    // QR convive con el link + acciones del spec
    expect(
      screen.getByRole("img", {
        name: "Código QR del link de reclamo de ABC123",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enviar por WhatsApp" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Descargar QR" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Si perdés el link, podés revocarlo y generar uno nuevo.",
      ),
    ).toBeInTheDocument();
  });

  it("§2.2: copiar el link da feedback visible '¡Copiado!'", async () => {
    const user = userEvent.setup();
    primeListAfterCreate();
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Generar link de reclamo" }),
    );
    await screen.findByLabelText("Link de reclamo");

    await user.click(screen.getByRole("button", { name: "Copiar enlace" }));

    const copiedLabel = await screen.findByRole("button", {
      name: "¡Copiado!",
    });
    expect(copiedLabel).toBeInTheDocument();
    // El feedback es un live region: el texto del botón se anuncia.
    expect(screen.getByText("¡Copiado!")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("§2.2: si el QR falla se muestra el copy mapeado §2.14 (antes invisible en §2.2)", async () => {
    const user = userEvent.setup();
    primeListAfterCreate();
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Generar link de reclamo" }),
    );
    const qr = await screen.findByRole("img", {
      name: "Código QR del link de reclamo de ABC123",
    });

    fireEvent.error(qr);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(CLAIM_PANEL_QR_ERROR);
  });

  it("§2.3 vigente: badge + vencimiento + QR + acciones, SIN campo de link", async () => {
    mockListClaims.mockResolvedValue(listResponse([makeListItem()]));
    renderPanel();

    expect(await screen.findByText("Vigente")).toBeInTheDocument();
    expect(screen.getByText(/vence el \d{2}/i)).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Código QR del link de reclamo de ABC123",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Descargar QR" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revocar link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Por seguridad, el link no se vuelve a mostrar. Compartí el QR o revocá el link para generar uno nuevo.",
      ),
    ).toBeInTheDocument();

    // El link NO se vuelve a mostrar en re-display (copy §2.3).
    expect(
      screen.queryByLabelText("Link de reclamo"),
    ).not.toBeInTheDocument();
  });
});

describe("ClaimInvitePanel §2.6 (el vehículo ya tiene titular)", () => {
  it("vehicleHasActiveOwner y sin invite → la tarjeta no se renderiza en absoluto", async () => {
    const { container } = renderPanel({ vehicleHasActiveOwner: true });

    // No se monta el panel: ni título, ni aviso §2.6, ni CTA.
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /Reclamo del vehículo/i }),
      ).not.toBeInTheDocument();
    });
    expect(container.firstChild).toBeNull();
    expect(
      screen.queryByText(CLAIM_PANEL_ALREADY_TAKEN),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Generar link de reclamo" }),
    ).not.toBeInTheDocument();
  });

  it("sin vehicleHasActiveOwner (false) y sin invite → sigue el CTA de generar link", async () => {
    renderPanel({ vehicleHasActiveOwner: false });

    expect(
      await screen.findByRole("button", { name: "Generar link de reclamo" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(CLAIM_PANEL_ALREADY_TAKEN),
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      "active_owner",
      "Este vehículo ya tiene titular; no se envió invitación",
    ],
    ["already_owner", "El vehículo ya tiene titular registrado"],
  ])(
    "409 %s en create → aviso §2.6 y SIN CTA tras el error",
    async (_reason, message) => {
      const user = userEvent.setup();
      mockCreateClaim.mockRejectedValue({ status: 409, message });
      renderPanel();

      await user.click(
        await screen.findByRole("button", { name: "Generar link de reclamo" }),
      );

      expect(
        await screen.findByText(CLAIM_PANEL_ALREADY_TAKEN),
      ).toBeInTheDocument();
      expect(
        screen.getByText(CLAIM_PANEL_ALREADY_TAKEN_HELPER),
      ).toBeInTheDocument();
      // No se puede reintentar el 409: el CTA ya no está.
      expect(
        screen.queryByRole("button", { name: "Generar link de reclamo" }),
      ).not.toBeInTheDocument();
    },
  );
});
