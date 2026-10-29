/**
 * Sidebar del shell autenticado (desktop ≥ lg).
 *
 * Fondo azul profundo (token `primary`) — confianza/trazabilidad, inspirado
 * en el mockup de marca Autentia. Comparte `NavSections` con el drawer
 * mobile para que la navegación sea idéntica en ambos layouts.
 *
 * Nota de accesibilidad: en mobile el sidebar queda `hidden` (fuera del
 * árbol de accesibilidad); la navegación mobile vive en el drawer.
 */

import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { NavSections } from "./nav-sections";
import type { NavSection } from "./nav-config";

interface AppSidebarProps {
  sections: NavSection[];
  pathname: string;
  /** Iniciales del usuario (o null → ícono de respaldo). */
  initials: string | null;
  /** Nombre visible del usuario en el pie del sidebar. */
  userName: string;
  onLogout: () => void;
  className?: string;
}

export function AppSidebar({
  sections,
  pathname,
  initials,
  userName,
  onLogout,
  className,
}: AppSidebarProps) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-primary text-primary-foreground lg:flex",
        className,
      )}
    >
      {/* Marca */}
      <div className="px-4 pb-4 pt-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/70"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success"
          >
            <ShieldCheck className="h-5 w-5 text-success-foreground" />
          </span>
          <span className="text-base font-bold tracking-tight">Autentia</span>
        </Link>
        <p className="mt-1 pl-[46px] text-[11px] leading-tight text-primary-foreground/70">
          Historia Clínica Digital Vehicular
        </p>
      </div>

      {/* Navegación */}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-4">
        <NavSections sections={sections} pathname={pathname} />
      </div>

      {/* Pie: confianza + cuenta */}
      <div className="border-t border-primary-foreground/15 px-4 py-4">
        <p className="flex items-center gap-2 text-xs font-medium text-primary-foreground/80">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          Datos protegidos
        </p>
        <p className="mt-0.5 pl-6 text-[11px] text-primary-foreground/70">
          Registros trazables y seguros
        </p>

        <div className="mt-4 flex items-center gap-2.5">
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
            title="Cerrar sesión"
            className="h-9 w-9 shrink-0 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
