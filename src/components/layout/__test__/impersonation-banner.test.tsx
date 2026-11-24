/**
 * ImpersonationBanner — banner global de impersonación (D-016).
 *
 * Comportamientos críticos:
 * - Solo renderiza cuando /auth/me trae `impersonated === true`.
 * - Muestra el nombre de la sesión impersonada + role="alert" + CTA
 *   "Dejar de impersonar".
 * - Click → POST /auth/stop-impersonate y, en éxito, navegación COMPLETA
 *   (window.location.assign) a la ruta actual (los tests espían assign).
 * - 403 → mensaje inline accionable, sin navegar; el botón queda para reintentar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";

const mockStopImpersonate = vi.fn();

vi.mock("@/lib/api", () => ({
  authApi: {
    stopImpersonate: () => mockStopImpersonate(),
  },
}));

let mockUser: Record<string, unknown> | null;

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: mockUser,
    clearSession: vi.fn(),
  }),
}));

const assignSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  assignSpy.mockReset();
  vi.spyOn(window.location, "assign").mockImplementation(assignSpy);
  mockUser = {
    id: "target-1",
    email: "juan@taller.com",
    firstName: "Juan",
    lastName: "Taller",
    impersonated: true,
    impersonatedBy: "admin-root",
  };
});

function renderBanner() {
  return render(<ImpersonationBanner />);
}

describe("ImpersonationBanner", () => {
  it("no renderiza nada cuando la sesión NO es una impersonación", () => {
    mockUser = {
      id: "admin-1",
      email: "root@autentia.app",
      firstName: "Rita",
      lastName: "Admin",
    };
    renderBanner();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dejar de impersonar/i }),
    ).not.toBeInTheDocument();
  });

  it("visible con impersonated === true: muestra el nombre y el CTA", () => {
    renderBanner();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Impersonando a Juan Taller");
    expect(
      screen.getByRole("button", { name: /dejar de impersonar/i }),
    ).toBeEnabled();
  });

  it("click en “Dejar de impersonar” llama al endpoint y navega (reload completo)", async () => {
    const user = userEvent.setup();
    mockStopImpersonate.mockResolvedValue({ success: true });
    renderBanner();

    await user.click(
      screen.getByRole("button", { name: /dejar de impersonar/i }),
    );

    await waitFor(() => {
      expect(mockStopImpersonate).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith(
        `${window.location.pathname}${window.location.search}`,
      );
    });
  });

  it("403 → mensaje inline y SIN navegar; el botón queda para reintentar", async () => {
    const user = userEvent.setup();
    mockStopImpersonate.mockRejectedValue({ status: 403 });
    renderBanner();

    await user.click(
      screen.getByRole("button", { name: /dejar de impersonar/i }),
    );

    await screen.findByText("La sesión actual no es una impersonación.");
    expect(assignSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /dejar de impersonar/i }),
    ).toBeEnabled();
  });
});
