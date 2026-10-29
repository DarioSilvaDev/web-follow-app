"use client";

/**
 * Layout del dashboard — header con nav + chip de contexto activo.
 *
 * Navegación (decisión de UX, reemplaza al ContextSelector del header):
 *   Inicio · Transferencias · Concesionarias · Talleres · Administración ·
 *   Mi perfil
 * - "Concesionarias" solo si `dealershipMemberships.length > 0`;
 * - "Talleres" solo si `workshopMemberships.length > 0`;
 * - "Administración" solo si `hasAdminAccess(user)` (workspace admin).
 * - NO hay items de Atenciones en el nav (F-023: son quick actions del
 *   dashboard, no del header).
 *
 * El contexto activo (WORKSHOP/DEALERSHIP) se deriva de la ruta vía
 * `useRouteDerivedContext` (detalles `/dealerships/<uuid>` y
 * `/workshops/<uuid>`); el chip `ContextChip` lo muestra y permite volver
 * a PERSONAL con la ✕. "Inicio" (/dashboard) NO limpia el contexto.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContextChip } from "@/components/layout/context-chip";
import { useAuth } from "@/hooks/use-auth";
import { useRouteDerivedContext } from "@/hooks/use-route-derived-context";
import { hasAdminAccess } from "@/lib/admin-access";
import { authApi } from "@/lib/api";
import { cn } from "cn";

// Hrefs que se activan SOLO en match exacto del pathname: evita que
// "Inicio" (/dashboard) se marque activa en subrutas hipotéticas y que
// "/profile" capture prefijos futuros. El resto usa startsWith (así
// /dealerships/<id> marca "Concesionarias" y /workshops/<id> "Talleres").
const EXACT_MATCH_HREFS = new Set(["/dashboard", "/profile"]);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, clearSession } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Contexto activo derivado de la ruta (ruta explícita > contexto vigente).
  useRouteDerivedContext();

  // Session lost (expired cookies, refresh failure) → redirect to login
  // preserving the intended destination (RF-3).
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(
        `/login?next=${encodeURIComponent(window.location.pathname)}`,
      );
    }
  }, [status, router]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if logout fails, clear local state
    } finally {
      clearSession();
      router.push("/login");
    }
  };

  const initials = user
    ? [user.firstName?.[0], user.lastName?.[0]]
        .filter(Boolean)
        .join("")
        .toUpperCase()
    : null;

  // PM §29 (D-105): "Concesionarias" solo se renderiza cuando el usuario
  // tiene `dealershipMemberships` (datos de sesión — no permisos genéricos).
  const hasDealerships = (user?.dealershipMemberships?.length ?? 0) > 0;
  const hasWorkshops = (user?.workshopMemberships?.length ?? 0) > 0;

  // Onboarding administrado de concesionaria: "Administración" (workspace
  // admin) solo para roles/permisos de plataforma (UX — el backend enforcea).
  const isAdmin = hasAdminAccess(user);

  const isActive = (href: string) => {
    if (EXACT_MATCH_HREFS.has(href)) return pathname === href;
    return pathname.startsWith(href);
  };

  // "page" solo en match exacto del pathname; "true" en match por prefijo
  // (así /dealerships/<id> no marca aria-current="page" en Concesionarias).
  const ariaCurrent = (href: string) => {
    if (pathname === href) return "page" as const;
    return isActive(href) ? ("true" as const) : undefined;
  };

  const navLinks = [
    { href: "/dashboard", label: "Inicio" },
    // Fase 1 / D-078: panel de transferencias (base — owner en contexto PERSONAL).
    { href: "/transferencias", label: "Transferencias" },
    // Milestone consignación (D-105 / spec §8): gestión de concesionarias.
    { href: "/dealerships", label: "Concesionarias", visible: hasDealerships },
    // Listado de talleres del usuario (espejo de Concesionarias).
    { href: "/workshops", label: "Talleres", visible: hasWorkshops },
    { href: "/admin", label: "Administración", visible: isAdmin },
    { href: "/profile", label: "Mi perfil" },
  ].filter((item) => item.visible !== false);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-background sticky top-0 z-40">
        <div className="mx-auto flex h-12 max-w-screen-xl items-center justify-between px-4">
          {/* Logo */}
          <Link
            href="/dashboard"
            className="text-base font-bold tracking-tight text-foreground"
          >
            Autentia
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ariaCurrent(item.href)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {item.label}
              </Link>
            ))}

            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-border">
              <ContextChip />
              {/* User avatar + logout */}
              {user && (
                <>
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium"
                    title={`${user.firstName} ${user.lastName}`}
                  >
                    {initials || <User className="h-3.5 w-3.5" />}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleLogout}
                    title="Cerrar sesión"
                    className="h-7 w-7"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </nav>

          {/* Mobile hamburger */}
          <div className="flex items-center gap-2 md:hidden">
            <ContextChip />
            {user && (
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium"
                title={`${user.firstName} ${user.lastName}`}
              >
                {initials || <User className="h-3.5 w-3.5" />}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="h-8 w-8"
              aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            >
              {mobileOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <Menu className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-background">
            <nav className="flex flex-col px-4 py-3 gap-1">
              {navLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={ariaCurrent(item.href)}
                  className={cn(
                    "px-3 py-2 text-sm rounded-md transition-colors",
                    isActive(item.href)
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <div className="border-t border-border mt-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="justify-start gap-2 text-muted-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </Button>
              </div>
            </nav>
          </div>
        )}
      </header>
      <main className="flex-1 bg-muted/30">
        <div className="mx-auto max-w-screen-xl px-4 py-6">{children}</div>
      </main>
    </div>
  );
}
