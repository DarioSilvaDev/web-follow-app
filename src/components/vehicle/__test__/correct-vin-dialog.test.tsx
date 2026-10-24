/**
 * Tests for CorrectVinDialog (D-03, Gap 1).
 *
 * The dialog is presentational: it validates the new VIN with the shared
 * format rule (D-145) and the reason locally, then hands a normalized VIN +
 * trimmed reason to the parent's `onConfirm`. It never calls the API itself.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CorrectVinDialog } from "@/components/vehicle/correct-vin-dialog";

// Mock the dialog primitives to avoid the Base UI portal in happy-dom.
vi.mock("@/components/ui/dialog", () => {
  const Dialog = ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div role="dialog">{children}</div> : null);
  const DialogPopup = ({
    children,
    ...props
  }: React.ComponentProps<"div">) => <div {...props}>{children}</div>;
  const DialogTitle = ({
    children,
    ...props
  }: React.ComponentProps<"div">) => <h2 {...props}>{children}</h2>;
  const DialogDescription = ({
    children,
    ...props
  }: React.ComponentProps<"div">) => <div {...props}>{children}</div>;
  // Base UI's DialogClose takes the element to render via `render`; the mock
  // forwards those element props (e.g. `disabled`) so pending-state assertions
  // keep working.
  const DialogClose = ({
    children,
    render,
    ...props
  }: React.ComponentProps<"button"> & {
    render?: React.ReactElement<React.ComponentProps<"button">>;
  }) => (
    <button {...props} {...(render ? render.props : {})}>
      {children}
    </button>
  );
  return { Dialog, DialogPopup, DialogTitle, DialogDescription, DialogClose };
});
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.ComponentProps<"label">) => (
    <label {...props}>{children}</label>
  ),
}));

const VALID_VIN = "1HGCM82633A004352";

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof CorrectVinDialog>> = {},
) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <CorrectVinDialog
      open
      onOpenChange={onOpenChange}
      currentVin="WVW123"
      isPending={false}
      dialogError={null}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe("CorrectVinDialog", () => {
  it("shows the current VIN read-only and rejects an invalid new VIN", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    expect(screen.getByLabelText(/vin actual/i)).toHaveValue("WVW123");

    const confirm = screen.getByRole("button", { name: "Corregir VIN" });
    // Invalid (short) VIN → error on submit attempt, no confirm.
    await user.type(screen.getByLabelText(/nuevo vin/i), "WVW123");
    await user.click(confirm);
    expect(
      screen.getByText("El VIN debe tener 17 caracteres válidos (sin I, O ni Q)."),
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("requires a reason before confirming", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.type(screen.getByLabelText(/nuevo vin/i), VALID_VIN);
    await user.click(screen.getByRole("button", { name: "Corregir VIN" }));

    expect(
      screen.getByText("Ingresá el motivo de la corrección."),
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms with a normalized VIN and a trimmed reason", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.type(screen.getByLabelText(/nuevo vin/i), "1hgcm82633a004352");
    await user.type(
      screen.getByLabelText(/motivo/i),
      "  Error de tipeo en el alta  ",
    );
    await user.click(screen.getByRole("button", { name: "Corregir VIN" }));

    expect(onConfirm).toHaveBeenCalledWith(
      VALID_VIN,
      "Error de tipeo en el alta",
    );
  });

  it("shows the persistent error and disables actions while pending", async () => {
    renderDialog({
      isPending: true,
      dialogError: "No se pudo corregir el VIN.",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudo corregir el VIN.",
    );
    expect(screen.getByRole("button", { name: "Corregir VIN" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });
});
