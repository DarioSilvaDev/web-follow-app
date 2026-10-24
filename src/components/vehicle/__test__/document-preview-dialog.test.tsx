/**
 * Tests for DocumentPreviewDialog (F-013 visualización — preview de PDF).
 *
 * Critical behaviors:
 * - Desktop/Android: renders an <iframe> with the signed URL (+ #toolbar=0)
 *   and a fallback (abrir pestaña / descargar) behind it.
 * - iOS/iPadOS: no iframe — native viewer screen ("Abrir en el visor del
 *   sistema") + "Descargar".
 * - Close button calls onClose.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DocumentPreviewDialog, isIOS } from "../document-preview-dialog";
import type { VehicleDocument } from "@/types/vehicle";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<VehicleDocument> = {}): VehicleDocument {
  return {
    id: "d1",
    vehicleId: "v1",
    key: "vehicles/v1/documents/cedula.pdf",
    name: "Cédula verde",
    documentType: "Cédula",
    expiresAt: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    url: "https://signed.example/cedula.pdf",
    ...overrides,
  };
}

/** Stub del userAgent para simular iOS en happy-dom. */
function stubUserAgent(userAgent: string, platform = "iPhone") {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    get: () => userAgent,
  });
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    get: () => platform,
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    configurable: true,
    get: () => 5,
  });
}

const originalUA = window.navigator.userAgent;
const originalPlatform = window.navigator.platform;

afterEach(() => {
  stubUserAgent(originalUA, originalPlatform);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("DocumentPreviewDialog — desktop/Android", () => {
  it("renders an iframe with the signed URL and toolbar hint", () => {
    stubUserAgent("Mozilla/5.0 (Linux; Android 14)", "Linux armv8l");
    expect(isIOS()).toBe(false);

    render(
      <DocumentPreviewDialog
        open
        onClose={vi.fn()}
        doc={makeDoc()}
        url="https://signed.example/cedula.pdf"
      />,
    );

    const iframe = screen.getByTitle(
      "Vista previa del documento Cédula verde",
    ) as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute("src")).toBe(
      "https://signed.example/cedula.pdf#toolbar=0&view=FitH",
    );
    // Fallback actions visible behind the iframe.
    expect(screen.getByText("No se pudo mostrar el PDF aquí.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /abrir en una pestaña nueva/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /descargar/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("calls onClose via the close button", () => {
    const onClose = vi.fn();
    stubUserAgent("Mozilla/5.0 (Windows NT 10.0)", "Win32");
    render(
      <DocumentPreviewDialog open onClose={onClose} doc={makeDoc()} url="https://x/y.pdf" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cerrar vista previa" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("DocumentPreviewDialog — iOS fallback", () => {
  it("detects iOS and skips the iframe in favor of the native viewer", () => {
    stubUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone");
    expect(isIOS()).toBe(true);

    render(
      <DocumentPreviewDialog
        open
        onClose={vi.fn()}
        doc={makeDoc()}
        url="https://signed.example/cedula.pdf"
      />,
    );

    expect(
      screen.queryByTitle("Vista previa del documento Cédula verde"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /abrir en el visor del sistema/i }),
    ).toHaveAttribute("href", "https://signed.example/cedula.pdf");
    expect(screen.getByRole("link", { name: /descargar/i })).toBeInTheDocument();
  });

  it("detects iPadOS via MacIntel + maxTouchPoints", () => {
    stubUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", "MacIntel");
    // maxTouchPoints = 5 (stubbed above) → iPadOS.
    expect(isIOS()).toBe(true);
  });
});
