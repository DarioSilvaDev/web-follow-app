/**
 * Tests for /admin/users (listado denso de usuarios de plataforma).
 *
 * Critical behaviors:
 * - Renders the dense table: usuario (link al detalle) / estado / roles /
 *   contadores de vínculos (talleres, concesionarias, vehículos).
 * - Filtro "Vínculo" llama al backend con membership=workshop|dealership|…
 * - Orden pendientes-primero es server-side (no hay sort client-side).
 *
 * Convención del repo (mock al borde: @/lib/api, @/hooks/*, next/link).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminUsersPage from "../page";

// ─── Mocks (antes de los imports dinámicos) ──────────────────────────────────

const mockListUsers = vi.fn();

vi.mock("@/lib/api", () => ({
  adminApi: {
    listUsers: (...args: unknown[]) => mockListUsers(...args),
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "root-1",
      roles: [{ type: "super_admin", permissions: ["*"] }],
    },
    status: "authenticated",
  }),
}));

// Debounce inmediato (los tests de búsqueda con timers viven en otros suites).
vi.mock("@/hooks/use-debounce", () => ({
  useDebounce: <T,>(value: T) => value,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const meta = { total: 2, page: 1, limit: 10, totalPages: 1 };

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u-1",
    email: "ada@autentia.app",
    firstName: "Ada",
    lastName: "Lovelace",
    status: "active",
    createdAt: "2026-01-10T00:00:00.000Z",
    roles: [{ id: "r-1", type: "admin", name: "Administrador" }],
    workshopCount: 2,
    dealershipCount: 0,
    vehicleCount: 1,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminUsersPage />
    </QueryClientProvider>,
  );
}

describe("AdminUsersPage (tabla densa)", () => {
  beforeEach(() => {
    mockListUsers.mockReset();
    mockListUsers.mockResolvedValue({
      data: [
        makeUser(),
        makeUser({
          id: "u-2",
          email: "grace@autentia.app",
          firstName: "Grace",
          lastName: "Hopper",
          status: "pending",
          roles: [],
          workshopCount: 0,
          dealershipCount: 3,
          vehicleCount: 0,
        }),
      ],
      meta: { ...meta },
    });
  });

  it("renders filas con contadores de vínculos y estados", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    });

    // Links al detalle
    expect(
      screen.getByRole("link", { name: "Ada Lovelace" }),
    ).toHaveAttribute("href", "/admin/users/u-1");

    // Badges de estado (el texto también aparece en los <option> del filtro)
    expect(screen.getByText("Activo", { selector: "div" })).toBeInTheDocument();
    expect(
      screen.getByText("Pendiente", { selector: "div" }),
    ).toBeInTheDocument();

    // Rol de plataforma
    expect(screen.getByText("Administrador")).toBeInTheDocument();

    // Contadores (2 talleres, 3 concesionarias en las filas)
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("llama al backend con membership al cambiar el filtro “Vínculo”", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(mockListUsers).toHaveBeenCalledTimes(1);
    });
    expect(mockListUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ membership: undefined }),
    );

    await user.selectOptions(
      screen.getByLabelText("Vínculo"),
      "workshop",
    );

    await waitFor(() => {
      expect(mockListUsers).toHaveBeenCalledWith(
        expect.objectContaining({ membership: "workshop" }),
      );
    });
  });

  it("no ofrece sort client-side (orden pendientes-primero es server-side)", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    });
    // Ningún encabezado clicable de ordenamiento
    expect(
      screen.queryByRole("columnheader", { name: /ordenar/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/pendientes primero/i)).toBeInTheDocument();
  });
});
