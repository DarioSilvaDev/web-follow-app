"use client";

import { useState } from "react";
import { Download, ExternalLink, FileText, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogPopupFullScreen,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VehicleDocument } from "@/types/vehicle";
import { formatDate } from "@/lib/format-date";

// ---------------------------------------------------------------------------
// Detección iOS/iPadOS — solo visual, no afecta autorización.
// En iOS el <iframe> de PDF es inconsistente (1ª página o vacío); se usa el
// visor nativo (Quick Look) vía target="_blank", que además trae zoom.
// ---------------------------------------------------------------------------
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

interface DocumentPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  doc: VehicleDocument;
  /** URL firmada efectiva (batch o refrescada vía getDocumentSignedUrl). */
  url: string;
}

/**
 * Preview full-screen de un documento PDF (F-013 visualización).
 * - Desktop/Android: <iframe> del PDF + barra inferior con fallback
 *   (abrir en pestaña / descargar) siempre visible.
 * - iOS/iPadOS: sin iframe — pantalla con acción "Abrir en el visor del
 *   sistema" (Quick Look) + "Descargar".
 */
export function DocumentPreviewDialog({
  open,
  onClose,
  doc,
  url,
}: DocumentPreviewDialogProps) {
  const [iframeLoading, setIframeLoading] = useState(true);
  const useNativeViewer = isIOS();

  if (!open) return null;

  const metadata = (
    <p className="text-sm text-white/70">
      {doc.documentType}
      {doc.expiresAt ? ` · vence ${formatDate(doc.expiresAt)}` : ""}
    </p>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }} disablePointerDismissal>
      <DialogPopupFullScreen>
        <DialogTitle className="sr-only">
          Vista previa del documento {doc.name}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {doc.name} — {doc.documentType}
        </DialogDescription>

        {/* Barra superior */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cerrar vista previa"
            className="h-11 w-11 text-white hover:bg-white/10 hover:text-white"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
          <p className="min-w-0 flex-1 truncate text-center text-sm text-white/90">
            {doc.name}
          </p>
          {/* Reservado para simetría del layout. */}
          <span className="h-11 w-11" aria-hidden="true" />
        </div>

        {useNativeViewer ? (
          // --- Fallback iOS/iPadOS: visor nativo (Quick Look) ---------------
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <FileText className="h-14 w-14 text-white/50" />
            <div>
              <p className="font-medium text-white">{doc.name}</p>
              {metadata}
            </div>
            <div className="flex w-full max-w-xs flex-col gap-2">
              <Button
                render={
                  <a href={url} target="_blank" rel="noreferrer" />
                }
                className="w-full"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir en el visor del sistema
              </Button>
              <Button
                render={<a href={url} target="_blank" rel="noreferrer" />}
                variant="outline"
                className="w-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Download className="h-4 w-4" />
                Descargar
              </Button>
            </div>
          </div>
        ) : (
          // --- Desktop/Android: iframe + fallback detrás --------------------
          <div className="relative min-h-0 flex-1">
            {/* Fallback visible detrás del iframe (si el browser no puede
                mostrar el PDF, el iframe queda transparente/vacío). */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
              <FileText className="h-12 w-12 text-white/50" />
              <p className="text-sm text-white/80">
                No se pudo mostrar el PDF aquí.
              </p>
              <div className="flex gap-2">
                <Button
                  render={<a href={url} target="_blank" rel="noreferrer" />}
                  variant="outline"
                  size="sm"
                  className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir en una pestaña nueva
                </Button>
                <Button
                  render={<a href={url} target="_blank" rel="noreferrer" />}
                  variant="outline"
                  size="sm"
                  className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar
                </Button>
              </div>
            </div>

            {iframeLoading && (
              <div
                role="status"
                aria-label="Cargando documento"
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/60"
              >
                <Loader2 className="h-6 w-6 animate-spin text-white/70" />
              </div>
            )}

            {/* Los parámetros de firma viven en la query string; un hash
                (#toolbar=0) no rompe la firma. */}
            <iframe
              src={`${url}#toolbar=0&view=FitH`}
              title={`Vista previa del documento ${doc.name}`}
              className="relative z-20 h-full w-full border-0 bg-white"
              onLoad={() => setIframeLoading(false)}
            />
          </div>
        )}

        {/* Barra inferior (solo desktop/Android, con metadata). */}
        {!useNativeViewer && (
          <div className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-center">
            {metadata}
          </div>
        )}
      </DialogPopupFullScreen>
    </Dialog>
  );
}
