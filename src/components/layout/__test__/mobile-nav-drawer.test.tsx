/**
 * MobileNavDrawer — menú colapsable del shell (mobile).
 *
 * Comportamientos críticos:
 * - `role="dialog"` + `aria-modal` + foco inicial en el primer control.
 * - Escape y el botón "Cerrar menú" invocan `onClose`.
 * - Navegar (link) cierra el drawer (`onNavigate` → onClose).
 * - Los links del drawer coinciden con la config del nav (rutas reales).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { buildNavSections } from "@/components/layout/nav-config";

// El Link real necesita router context → mock funcional (patrón del repo).
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

const SECTIONS = buildNavSections({
  hasWorkshops: true,
  hasDealerships: false,
  isAdmin: false,
});

function renderDrawer(onClose = vi.fn(), onLogout = vi.fn()) {
  render(
    <MobileNavDrawer
      open
      onClose={onClose}
      sections={SECTIONS}
      pathname="/dashboard"
      initials="DS"
      userName="Darío Silva"
      onLogout={onLogout}
    />,
  );
  return { onClose, onLogout };
}

describe("MobileNavDrawer", () => {
  const onClose = vi.fn();
  const onLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza como dialog modal con la navegación del shell", () => {
    renderDrawer(onClose, onLogout);

    const dialog = screen.getByRole("dialog", { name: "Menú de navegación" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    // El rol ARIA de <nav> es "navigation" ("nav" no es un alias en TL).
    const nav = within(dialog).getByRole("navigation", {
      name: "Navegación principal",
    });
    // Rutas reales del shell (sin "Historial"/"Documentos" inventados)
    expect(within(nav).getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(
      within(nav).getByRole("link", { name: "Mis vehículos" }),
    ).toHaveAttribute("href", "/vehicles");
    expect(
      within(nav).getByRole("link", { name: "Talleres" }),
    ).toHaveAttribute("href", "/workshops");
    expect(
      within(nav).getByRole("link", { name: "Transferencias" }),
    ).toHaveAttribute("href", "/transferencias");
    expect(
      within(nav).getByRole("link", { name: "Mi perfil" }),
    ).toHaveAttribute("href", "/profile");

    // El item activo queda marcado con aria-current="page"
    expect(
      within(nav).getByRole("link", { name: "Inicio" }),
    ).toHaveAttribute("aria-current", "page");

    // Sin items de atenciones (F-023)
    expect(
      within(nav).queryByRole("link", { name: "Atenciones" }),
    ).not.toBeInTheDocument();
  });

  it("el botón 'Cerrar menú' invoca onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();

    await user.click(screen.getByRole("button", { name: "Cerrar menú" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape cierra el drawer", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("navegar desde un link cierra el drawer", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();

    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("link", { name: "Mis vehículos" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("el pie muestra el usuario y la acción de cerrar sesión", async () => {
    const user = userEvent.setup();
    const { onLogout } = renderDrawer();

    expect(screen.getByText("Darío Silva")).toBeInTheDocument();
    expect(screen.getByText("Datos protegidos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(onLogout).toHaveBeenCalled();
  });

  it("cerrado → no renderiza nada (no duplica links en el DOM)", () => {
    render(
      <MobileNavDrawer
        open={false}
        onClose={vi.fn()}
        sections={SECTIONS}
        pathname="/dashboard"
        initials="DS"
        userName="Darío Silva"
        onLogout={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
