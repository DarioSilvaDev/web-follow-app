"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImageOff,
  Loader2,
  RotateCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogPopupFullScreen,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format-date";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Ítem genérico del visor (foto de vehículo o imagen subida como documento). */
export interface MediaViewerItem {
  id: string;
  /** Signed URL; si falta, el ítem se muestra como no disponible. */
  url?: string;
  alt: string;
  caption?: string | null;
  createdAt?: string;
}

interface VehicleMediaViewerProps {
  open: boolean;
  onClose: () => void;
  items: MediaViewerItem[];
  index: number;
  onIndexChange: (index: number) => void;
  /**
   * "photo": indicador "Foto i de n" + caption + fecha.
   * "document-image": un solo ítem (o varios), sin cambio de semantics.
   */
  mediaKind: "photo" | "document-image";
  /**
   * Refetch de la URL firmada individual cuando la imagen falla (URL batch
   * expirada). Debe resolver con la nueva URL o undefined si falla.
   */
  onRefetchUrl?: (itemId: string) => Promise<string | undefined>;
  /** Si se provee, muestra "Descargar" en la barra inferior (documentos). */
  downloadUrl?: string;
}

// ---------------------------------------------------------------------------
// Swipe (pointer events) — mobile-first
// ---------------------------------------------------------------------------

const SWIPE_AXIS_THRESHOLD_PX = 10;
const SWIPE_NAV_THRESHOLD_PX = 50;
const SWIPE_CLOSE_THRESHOLD_PX = 80;

interface SwipeState {
  startX: number;
  startY: number;
  axis: "pending" | "horizontal" | "vertical";
}

// ---------------------------------------------------------------------------
// ViewerImage — carga/estado de una imagen. Se remonta vía `key` cuando la
// URL o el retryNonce cambian, reseteando su estado interno sin efectos.
// ---------------------------------------------------------------------------

function ViewerImage({
  src,
  alt,
  onError,
}: {
  src: string;
  alt: string;
  onError: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      {!loaded && (
        <div
          role="status"
          aria-label="Cargando imagen"
          className="absolute inset-0 flex items-center justify-center"
        >
          <Loader2 className="h-6 w-6 animate-spin text-white/70" />
        </div>
      )}
      {/* Host de R2 desconocido en build-time → <img> nativo (D-047). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={onError}
        className={`h-full w-full object-contain ${loaded ? "" : "opacity-0"}`}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

export function VehicleMediaViewer({
  open,
  onClose,
  items,
  index,
  onIndexChange,
  mediaKind,
  onRefetchUrl,
  downloadUrl,
}: VehicleMediaViewerProps) {
  const item = items[index];
  const total = items.length;

  // URL local override tras refetch puntual (no invalida la lista entera).
  const [urlOverrides, setUrlOverrides] = useState<Record<string, string>>({});
  // Ítem cuya imagen falló incluso tras el refetch (o sin URL desde el start).
  const [failedId, setFailedId] = useState<string | null>(null);
  // Nonce para forzar remontaje del <img> en "Reintentar" (mismo src).
  const [retryNonce, setRetryNonce] = useState(0);
  const refetchedIdsRef = useRef<Set<string>>(new Set());

  const effectiveUrl = item ? (urlOverrides[item.id] ?? item.url) : undefined;

  // Pre-carga de la siguiente foto (latencia percibida ~0 al navegar).
  useEffect(() => {
    if (!open) return;
    const next = items[index + 1];
    const nextUrl = next ? (urlOverrides[next.id] ?? next.url) : undefined;
    if (nextUrl) {
      const img = new Image();
      img.src = nextUrl;
    }
  }, [open, index, items, urlOverrides]);

  const handleImageError = useCallback(async () => {
    if (!item) return;
    // Refetch de la URL firmada una sola vez por ítem.
    if (onRefetchUrl && !refetchedIdsRef.current.has(item.id)) {
      refetchedIdsRef.current.add(item.id);
      try {
        const freshUrl = await onRefetchUrl(item.id);
        if (freshUrl) {
          // La nueva URL cambia la `key` de ViewerImage → remonta y recarga.
          setUrlOverrides((prev) => ({ ...prev, [item.id]: freshUrl }));
          setFailedId(null);
          return;
        }
      } catch {
        // cae a failedId abajo
      }
    }
    setFailedId(item.id);
  }, [item, onRefetchUrl]);

  const retry = useCallback(() => {
    if (!item) return;
    setFailedId(null);
    if (!effectiveUrl) {
      // Sin URL: reintenta el refetch puntual de la URL firmada.
      refetchedIdsRef.current.delete(item.id);
      void handleImageError();
      return;
    }
    // Con URL: fuerza remontaje del <img> (mismo src) vía retryNonce.
    setRetryNonce((n) => n + 1);
  }, [item, effectiveUrl, handleImageError]);

  // --- Navegación -----------------------------------------------------------

  const goPrev = useCallback(() => {
    if (index > 0) onIndexChange(index - 1);
  }, [index, onIndexChange]);

  const goNext = useCallback(() => {
    if (index < total - 1) onIndexChange(index + 1);
  }, [index, total, onIndexChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "Home") {
        event.preventDefault();
        onIndexChange(0);
      } else if (event.key === "End") {
        event.preventDefault();
        onIndexChange(total - 1);
      }
    },
    [goPrev, goNext, onIndexChange, total],
  );

  // --- Swipe ----------------------------------------------------------------

  const swipeRef = useRef<SwipeState | null>(null);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    swipeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      axis: "pending",
    };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.axis !== "pending") return;
    const dx = Math.abs(event.clientX - swipe.startX);
    const dy = Math.abs(event.clientY - swipe.startY);
    if (dx >= SWIPE_AXIS_THRESHOLD_PX || dy >= SWIPE_AXIS_THRESHOLD_PX) {
      swipe.axis = dx > dy ? "horizontal" : "vertical";
    }
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    const swipe = swipeRef.current;
    swipeRef.current = null;
    if (!swipe) return;
    const dx = event.clientX - swipe.startX;
    const dy = event.clientY - swipe.startY;

    if (swipe.axis === "horizontal") {
      const container = event.currentTarget as HTMLElement;
      const navThreshold = Math.max(
        SWIPE_NAV_THRESHOLD_PX,
        container.clientWidth * 0.15,
      );
      if (Math.abs(dx) < navThreshold) return;
      // El swipe horizontal NUNCA cierra (evita cierres accidentales).
      if (dx < 0) goNext();
      else goPrev();
    } else if (swipe.axis === "vertical" && dy > SWIPE_CLOSE_THRESHOLD_PX) {
      // Swipe vertical hacia abajo = cerrar (patrón de galerías móviles).
      onClose();
    }
  };

  // --- Render ---------------------------------------------------------------

  if (!open || !item) return null;

  const captionText = item.caption?.trim() || null;
  const showNavButtons = total > 1;
  const showDots = total > 1 && total <= 8;
  const showError = failedId === item.id || !effectiveUrl;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }} disablePointerDismissal>
      <DialogPopupFullScreen onKeyDown={handleKeyDown}>
        {/* Títulos accesibles (sr-only) — el indicador visual es "Foto i de n". */}
        <DialogTitle className="sr-only">
          {mediaKind === "photo" ? "Visor de fotos" : "Vista previa de imagen"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {mediaKind === "photo"
            ? `Foto ${index + 1} de ${total}`
            : item.alt}
        </DialogDescription>

        {/* Barra superior — pt para safe-area (viewport-fit=cover en layout). */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cerrar visor"
            className="h-11 w-11 text-white hover:bg-white/10 hover:text-white"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
          <p
            aria-live="polite"
            className="text-sm text-white/70"
          >
            {mediaKind === "photo" && total > 1
              ? `Foto ${index + 1} de ${total}`
              : ""}
          </p>
          {/* Reservado para simetría del layout. */}
          <span className="h-11 w-11" aria-hidden="true" />
        </div>

        {/* Área de la imagen + gestos. */}
        <div
          className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center overflow-hidden"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { swipeRef.current = null; }}
        >
          {showNavButtons && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Foto anterior"
              disabled={index === 0}
              className="absolute left-1 z-10 h-11 w-11 text-white hover:bg-white/10 hover:text-white disabled:opacity-30"
              onClick={goPrev}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}

          {showError && (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <ImageOff className="h-10 w-10 text-white/50" />
              <p className="text-sm text-white/80">No se pudo cargar la imagen.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                onClick={retry}
              >
                <RotateCw className="h-3.5 w-3.5" />
                Reintentar
              </Button>
            </div>
          )}

          {effectiveUrl && !showError && (
            <ViewerImage
              key={`${item.id}-${effectiveUrl}-${retryNonce}`}
              src={effectiveUrl}
              alt={item.alt}
              onError={() => void handleImageError()}
            />
          )}

          {showNavButtons && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Foto siguiente"
              disabled={index === total - 1}
              className="absolute right-1 z-10 h-11 w-11 text-white hover:bg-white/10 hover:text-white disabled:opacity-30"
              onClick={goNext}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}
        </div>

        {/* Barra inferior — caption/fecha/descarga + puntos + safe-area. */}
        <div className="flex shrink-0 flex-col items-center gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          {showDots && (
            <div className="flex gap-1.5" aria-hidden="true">
              {items.map((dotItem, i) => (
                <span
                  key={dotItem.id}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i === index ? "bg-white" : "bg-white/30"
                  }`}
                />
              ))}
            </div>
          )}
          <div className="flex w-full items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-white/70">
              {captionText ?? (mediaKind === "photo" ? "Foto del vehículo" : item.alt)}
              {item.createdAt ? ` · ${formatDateTime(item.createdAt)}` : ""}
            </p>
            {downloadUrl && (
              <a
                href={downloadUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Descargar"
                title="Descargar"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
              >
                <Download className="h-5 w-5" />
              </a>
            )}
          </div>
        </div>
      </DialogPopupFullScreen>
    </Dialog>
  );
}
