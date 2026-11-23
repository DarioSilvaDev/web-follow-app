/**
 * AssignMemberDialog — reactivación de membresías dadas de baja.
 *
 * Comportamientos críticos:
 * - Con historial inactivo para la org elegida: bloque amber con fechas
 *   ("fue miembro ... desde X hasta Y") y el CTA cambia a
 *   "Reactivar membresía".
 * - Sin historial: CTA normal "Asignar" y sin aviso amber.
 * - El éxito informa `onAssigned` con { reactivated, previousLeftAt }.
 *
 * Convenciones del repo (mock al borde: @/lib/api, @/hooks/use-debounce).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AssignMemberDialog } from "@/components/admin/assign-member-dialog";

const mockListWorkshops = vi.fn();
const mockListWorkshopRoles = vi.fn();
const mockAddWorkshopMember = vi.fn();

vi.mock("@/lib/api", () => ({
  adminApi: {
    listWorkshops: (...args: unknown[]) => mockListWorkshops(...args),
    listWorkshopRoles: (...args: unknown[]) => mockListWorkshopRoles(...args),
    addWorkshopMember: (...args: unknown[]) => mockAddWorkshopMember(...args),
  },
}));

// Debounce inmediato en tests (los tests de timers viven en otros suites).
vi.mock("@/hooks/use-debounce", () => ({
  useDebounce: <T,>(value: T) => value,
}));

const INACTIVO = {
  entityId: "w1",
  joinedAt: "2025-03-01T00:00:00.000Z",
  leftAt: "2026-06-15T00:00:00.000Z",
};

function expectedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function renderDialog(props: {
  inactiveMemberships?: Array<typeof INACTIVO>;
  onAssigned?: (result: { reactivated: boolean; previousLeftAt: string | null }) => void;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AssignMemberDialog
        entityType="workshop"
        lockedEmail="maria@taller.com"
        inactiveMemberships={props.inactiveMemberships}
        onAssigned={props.onAssigned}
        triggerLabel="Asignar a taller"
      />
    </QueryClientProvider>,
  );
}

describe("AssignMemberDialog — reactivación con historial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListWorkshops.mockResolvedValue({
      data: [{ id: "w1", name: "Lubricentro Central", taxId: "30-12345678-9" }],
      meta: { total: 1, page: 1, limit: 5, totalPages: 1 },
    });
    mockListWorkshopRoles.mockResolvedValue([
      { id: "r1", code: "owner", name: "Dueño" },
    ]);
    mockAddWorkshopMember.mockResolvedValue({ reactivated: true });
  });

  it("muestra el bloque amber con fechas y el CTA “Reactivar membresía”", async () => {
    const user = userEvent.setup();
    renderDialog({ inactiveMemberships: [INACTIVO] });

    // Abrir el diálogo
    await user.click(screen.getByRole("button", { name: /asignar a taller/i }));

    // Buscar y elegir el taller
    await user.type(
      screen.getByLabelText(/buscar taller/i),
      "lubri",
    );
    await user.click(
      await screen.findByRole("button", { name: /lubricentro central/i }),
    );

    // Aviso amber con fechas de ingreso/baja
    const notice = await screen.findByText(
      /fue miembro de/i,
      { exact: false },
    );
    expect(notice.textContent).toContain(expectedDate(INACTIVO.joinedAt));
    expect(notice.textContent).toContain(expectedDate(INACTIVO.leftAt));

    // CTA cambió a "Reactivar membresía"
    expect(
      screen.getByRole("button", { name: /reactivar membresía/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^asignar$/i }),
    ).not.toBeInTheDocument();
  });

  it("sin historial inactivo: CTA “Asignar” y sin aviso amber", async () => {
    const user = userEvent.setup();
    renderDialog({ inactiveMemberships: [] });

    await user.click(screen.getByRole("button", { name: /asignar a taller/i }));
    await user.type(screen.getByLabelText(/buscar taller/i), "lubri");
    await user.click(
      await screen.findByRole("button", { name: /lubricentro central/i }),
    );

    expect(screen.queryByText(/fue miembro de/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^asignar$/i }),
    ).toBeInTheDocument();
  });

  it("éxito con reactivated: true → onAssigned recibe { reactivated: true, previousLeftAt }", async () => {
    const onAssigned = vi.fn();
    const user = userEvent.setup();
    renderDialog({ inactiveMemberships: [INACTIVO], onAssigned });

    await user.click(screen.getByRole("button", { name: /asignar a taller/i }));
    await user.type(screen.getByLabelText(/buscar taller/i), "lubri");
    await user.click(
      await screen.findByRole("button", { name: /lubricentro central/i }),
    );

    // Elegir rol y confirmar
    await user.selectOptions(
      await screen.findByLabelText(/rol/i),
      "r1",
    );
    await user.click(
      screen.getByRole("button", { name: /reactivar membresía/i }),
    );

    await waitFor(() => {
      expect(onAssigned).toHaveBeenCalledWith({
        reactivated: true,
        previousLeftAt: INACTIVO.leftAt,
      });
    });
  });
});
