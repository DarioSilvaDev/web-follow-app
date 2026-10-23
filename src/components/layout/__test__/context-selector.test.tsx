/**
 * Tests for the unified ContextSelector (header dropdown) — F-020 / P2-6 /
 * RF-3 + milestone consignación (D-107 / D-TL-12).
 *
 * Reemplaza a los anteriores WorkshopSelector + DealershipSelector (un único
 * selector de contexto activo, decisión de UX del usuario — doble "Personal"
 * confuso en el header).
 *
 * Critical behaviors:
 * - Renders workshop + dealership memberships together (optgroups).
 * - Selecting a workshop / dealership activates the matching context.
 * - The active context (either type) is reflected as the select value.
 * - Returning to "Personal" clears any context.
 * - Renders null when the user has no memberships (PERSONAL journey intact).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ContextSelector } from "@/components/layout/context-selector";
import {
  clearActiveContext,
  getActiveContext,
  selectDealership,
  selectWorkshop,
} from "@/lib/active-context";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockUseAuth = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockUseAuth(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUser() {
  return {
    id: "user-1",
    workshopMemberships: [
      {
        workshopId: "w1",
        workshop: { id: "w1", name: "Taller Mecánico Central" },
        role: { id: "r1", code: "owner", name: "Dueño" },
      },
      {
        workshopId: "w2",
        workshop: { id: "w2", name: "Taller Sur" },
        role: { id: "r2", code: "mechanic", name: "Mecánico" },
      },
    ],
    dealershipMemberships: [
      {
        dealershipId: "d1",
        dealershipName: "Concesionaria Norte",
        role: { id: "dr1", code: "manager", name: "Gerente" },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearActiveContext();
  mockUseAuth.mockReturnValue({
    user: makeUser(),
    status: "authenticated",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  clearActiveContext();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ContextSelector (selector único de contexto activo)", () => {
  it("renders workshops and dealerships together, plus Personal", () => {
    render(<ContextSelector />);

    expect(
      screen.getByRole("option", { name: "Personal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Taller Mecánico Central/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Taller Sur/ })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Concesionaria Norte/ }),
    ).toBeInTheDocument();
    // Un solo select en el header (regresión del doble selector).
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("selecting a workshop activates the WORKSHOP context", () => {
    render(<ContextSelector />);

    fireEvent.change(screen.getByLabelText(/contexto activo/i), {
      target: { value: "workshop:w1" },
    });

    expect(getActiveContext()).toEqual({ type: "WORKSHOP", workshopId: "w1" });
  });

  it("selecting a dealership activates the DEALERSHIP context", () => {
    render(<ContextSelector />);

    fireEvent.change(screen.getByLabelText(/contexto activo/i), {
      target: { value: "dealership:d1" },
    });

    expect(getActiveContext()).toEqual({
      type: "DEALERSHIP",
      dealershipId: "d1",
    });
  });

  it("switches directly from workshop to dealership (context swap)", () => {
    selectWorkshop("w2");
    render(<ContextSelector />);

    fireEvent.change(screen.getByLabelText(/contexto activo/i), {
      target: { value: "dealership:d1" },
    });

    expect(getActiveContext()).toEqual({
      type: "DEALERSHIP",
      dealershipId: "d1",
    });
  });

  it("shows the active workshop as the select value", () => {
    selectWorkshop("w2");
    render(<ContextSelector />);

    const select = screen.getByLabelText(
      /contexto activo/i,
    ) as HTMLSelectElement;
    expect(select.value).toBe("workshop:w2");
  });

  it("shows the active dealership as the select value (not Personal)", () => {
    selectDealership("d1");
    render(<ContextSelector />);

    const select = screen.getByLabelText(
      /contexto activo/i,
    ) as HTMLSelectElement;
    expect(select.value).toBe("dealership:d1");
  });

  it("returning to Personal clears any active context", () => {
    selectDealership("d1");
    render(<ContextSelector />);

    fireEvent.change(screen.getByLabelText(/contexto activo/i), {
      target: { value: "" },
    });

    expect(getActiveContext()).toBeNull();
  });

  it("renders null when the user has no memberships", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1", workshopMemberships: [], dealershipMemberships: [] },
      status: "authenticated",
    });

    const { container } = render(<ContextSelector />);
    expect(
      screen.queryByLabelText(/contexto activo/i),
    ).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the workshop group when the user has no dealership memberships", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1", workshopMemberships: makeUser().workshopMemberships },
      status: "authenticated",
    });

    render(<ContextSelector />);

    expect(
      screen.getByRole("option", { name: /Taller Sur/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Concesionaria Norte/ }),
    ).not.toBeInTheDocument();
  });
});
