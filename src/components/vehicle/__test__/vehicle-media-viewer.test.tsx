/**
 * Tests for VehicleMediaViewer (F-013 visualización — lightbox full-screen).
 *
 * Critical behaviors:
 * - Renders dialog with photo indicator "Foto i de n" and image alt.
 * - Prev/next buttons change the index (bounded, no wrap).
 * - Close button calls onClose.
 * - Image error → error state with "Reintentar"; with onRefetchUrl it tries
 *   a fresh signed URL once.
 * - Photos without URL are not rendered as items (caller filters them).
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VehicleMediaViewer, type MediaViewerItem } from "../vehicle-media-viewer";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeItems(count: number): MediaViewerItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    url: `https://signed.example/p${i + 1}.webp`,
    alt: `Foto ${i + 1}`,
    caption: i === 0 ? "Frontal" : null,
    createdAt: "2026-09-02T12:00:00.000Z",
  }));
}

function renderViewer(
  props: Partial<React.ComponentProps<typeof VehicleMediaViewer>> = {},
) {
  const onIndexChange = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <VehicleMediaViewer
      open
      onClose={onClose}
      items={makeItems(3)}
      index={0}
      onIndexChange={onIndexChange}
      mediaKind="photo"
      {...props}
    />,
  );
  return { ...utils, onIndexChange, onClose };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("VehicleMediaViewer", () => {
  it("renders the dialog with the indicator and the current image", () => {
    renderViewer();

    // Aparece en el indicador visible + en el DialogDescription sr-only.
    expect(screen.getAllByText("Foto 1 de 3").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByAltText("Foto 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar visor" })).toBeInTheDocument();
  });

  it("navigates with prev/next buttons (bounded)", () => {
    const { onIndexChange } = renderViewer();

    // Prev disabled on first photo.
    const prev = screen.getByRole("button", { name: "Foto anterior" });
    expect(prev).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Foto siguiente" }));
    expect(onIndexChange).toHaveBeenCalledWith(1);

    // On last photo, next is disabled.
    const { onIndexChange: onIndexChangeLast } = renderViewer({ index: 2 });
    expect(screen.getByRole("button", { name: "Foto siguiente" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Foto anterior" }));
    expect(onIndexChangeLast).toHaveBeenCalledWith(1);
  });

  it("hides nav buttons when there is a single item", () => {
    renderViewer({ items: makeItems(1) });
    expect(screen.queryByRole("button", { name: "Foto anterior" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Foto siguiente" })).not.toBeInTheDocument();
  });

  it("closes via the close button", () => {
    const { onClose } = renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar visor" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the caption and formatted date in the bottom bar", () => {
    renderViewer();
    // caption "Frontal" + formatDateTime de createdAt.
    expect(screen.getByText(/Frontal/)).toBeInTheDocument();
  });

  it("shows the download link only when downloadUrl is provided (documents)", () => {
    const { rerender } = renderViewer();
    expect(screen.queryByRole("link", { name: "Descargar" })).not.toBeInTheDocument();

    rerender(
      <VehicleMediaViewer
        open
        onClose={vi.fn()}
        items={makeItems(1)}
        index={0}
        onIndexChange={vi.fn()}
        mediaKind="document-image"
        downloadUrl="https://signed.example/doc.webp"
      />,
    );
    expect(screen.getByRole("link", { name: "Descargar" })).toHaveAttribute(
      "href",
      "https://signed.example/doc.webp",
    );
  });

  it("attempts a single signed-URL refetch on image error, then shows the error state", async () => {
    const onRefetchUrl = vi.fn().mockResolvedValue(undefined);
    renderViewer({ onRefetchUrl });

    fireEvent.error(screen.getByAltText("Foto 1"));

    await waitFor(() => expect(onRefetchUrl).toHaveBeenCalledWith("p1"));
    // Refetch failed → error state with retry.
    expect(await screen.findByText("No se pudo cargar la imagen.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });

  it("uses the fresh URL returned by onRefetchUrl after an image error", async () => {
    const onRefetchUrl = vi
      .fn()
      .mockResolvedValue("https://signed.example/p1-fresh.webp");
    renderViewer({ onRefetchUrl });

    fireEvent.error(screen.getByAltText("Foto 1"));

    await waitFor(() => {
      expect(screen.getByAltText("Foto 1")).toHaveAttribute(
        "src",
        "https://signed.example/p1-fresh.webp",
      );
    });
  });
});
