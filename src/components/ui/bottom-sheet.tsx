"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { cn } from "cn"

/**
 * BottomSheet — panel modal anclado al borde inferior (mobile-first).
 *
 * Mismos primitivos que `DialogPopup` (Portal + Backdrop + Popup de
 * @base-ui/react/dialog) pero posicionado abajo, con alto máximo
 * `85dvh`, esquinas superiores redondeadas y un "handle" visual
 * (affordance de arrastre; el cierre real ocurre con Escape, tap en el
 * backdrop o el botón ✕ — no hay gesto de drag implementado).
 *
 * Uso: contenido breve-intermedio (listados con scroll interno,
 * confirmaciones) en pantallas chicas. En sm+ queda centrado al borde
 * inferior con ancho máximo, no flota al centro.
 */

const BottomSheet = DialogPrimitive.Root

const BottomSheetClose = DialogPrimitive.Close

const BottomSheetBackdrop = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Backdrop>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Backdrop>
>(({ className, onClick, ...props }, ref) => (
  <DialogPrimitive.Backdrop
    ref={ref}
    onClick={onClick}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in",
      className,
    )}
    {...props}
  />
))
BottomSheetBackdrop.displayName = "BottomSheetBackdrop"

const BottomSheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup> & {
    /** Título accesible (requerido por DialogPrimitive.Title). */
    title: string
    onClose?: () => void
  }
>(({ className, children, title, onClose, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <BottomSheetBackdrop onClick={onClose} />
    <DialogPrimitive.Popup
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border-t bg-background shadow-2xl outline-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        className,
      )}
      {...props}
    >
      {/* Handle visual */}
      <div
        aria-hidden="true"
        className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
      />
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 pb-2 pt-2">
        <DialogPrimitive.Title className="text-base font-semibold leading-none tracking-tight">
          {title}
        </DialogPrimitive.Title>
        <DialogPrimitive.Close
          aria-label="Cerrar"
          className="rounded-md p-1.5 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </DialogPrimitive.Popup>
  </DialogPrimitive.Portal>
))
BottomSheetContent.displayName = "BottomSheetContent"

export { BottomSheet, BottomSheetContent, BottomSheetClose }
