"use client";

/**
 * Drawer de navegación mobile (menú colapsable del shell).
 *
 * - Se renderiza SOLO cuando está abierto (evita duplicar links en el DOM).
 * - Accesibilidad: `role="dialog"` + `aria-modal`, focus inicial, ciclo de
 *   Tab (focus trap simple), cierre con Escape y con click en el overlay.
 * - Cierra al navegar (el layout lo hace vía cambio de pathname).
 *
 * Mismo contenido de nav que el sidebar desktop (`NavSections`) → una sola
 * IA de navegación para ambos layouts.
 */

import { useEffect, useRef } from "react";
import Link from "next/link";
import { LogOut, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavSections } from "./nav-sections";
import type { NavSection } from "./nav-config";

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  sections: NavSection[];
  pathname: string;
  initials: string | null;
  userName: string;
  onLogout: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileNavDrawer({
  open,
  onClose,
  sections,
  pathname,
  initials,
  userName,
  onLogout,
}: MobileNavDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus inicial al abrir + Escape para cerrar.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      // Focus trap simple: ciclar Tab dentro del panel.
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      id="mobile-nav-drawer"
      className="fixed inset-0 z-50 lg:hidden"
      data-testid="mobile-nav-drawer"
    >
      {/* Overlay (solo click; el cierre accesible es el botón X o Escape) */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col bg-primary text-primary-foreground shadow-xl"
      >
        <div className="flex items-center justify-between px-4 pb-3 pt-5">
          <Link
            href="/dashboard"
            onClick={onClose}
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/70"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-success"
            >
              <ShieldCheck className="h-4.5 w-4.5 text-success-foreground" />
            </span>
            <span className="text-base font-bold tracking-tight">Autentia</span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="h-11 w-11 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-4 pt-3">
          <NavSections
            sections={sections}
            pathname={pathname}
            onNavigate={onClose}
          />
        </div>

        <div className="border-t border-primary-foreground/15 px-4 py-4">
          <p className="flex items-center gap-2 text-xs font-medium text-primary-foreground/80">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            Datos protegidos
          </p>
          <p className="mt-0.5 pl-6 text-[11px] text-primary-foreground/70">
            Registros trazables y seguros
          </p>

          <div className="mt-3 flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 text-xs font-semibold"
            >
              {initials ?? "U"}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {userName}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onLogout}
              aria-label="Cerrar sesión"
              className="h-11 w-11 shrink-0 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
