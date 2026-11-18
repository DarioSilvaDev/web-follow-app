"use client";

/**
 * Menú de cuenta del header del shell.
 *
 * Muestra el USUARIO AUTENTICADO — no al propietario del vehículo (regla de
 * dominio HCDV: la cuenta no representa la propiedad de ningún vehículo).
 *
 * Implementación propia (sin librería de menus) para mantener el contrato
 * accesible mínimo: `aria-haspopup`/`aria-expanded`/`aria-controls`, cierre
 * con Escape y con click fuera, foco visible y targets táctiles ≥ 40px.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, User } from "lucide-react";
import { cn } from "cn";

interface AccountMenuProps {
  /** Nombre visible del usuario autenticado. */
  userName: string;
  /** Iniciales para el avatar (o null → ícono de respaldo). */
  initials: string | null;
  onLogout: () => void;
}

export function AccountMenu({ userName, initials, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cierre con click fuera.
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  // Cierre con Escape + devolver foco al trigger.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        containerRef.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const menuId = "account-menu";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Menú de cuenta de ${userName}`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-2 rounded-full pl-1 pr-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {initials ?? <User className="h-4 w-4" />}
        </span>
        <span className="hidden max-w-[140px] truncate text-sm font-medium md:block">
          {userName}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "hidden h-4 w-4 text-muted-foreground transition-transform md:block",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Cuenta"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border bg-popover p-1 shadow-md"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="text-xs text-muted-foreground">Tu cuenta</p>
          </div>
          <div className="my-1 border-t border-border" />
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Mi perfil
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
