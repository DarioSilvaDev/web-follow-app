"use client";

/**
 * Layout del shell autenticado — sidebar desktop + header compacto +
 * drawer mobile.
 *
 * Navegación (config en `nav-config.ts`, decisiones PM de esta iteración):
 *   Inicio · Mis vehículos · Talleres · Concesionarias · Transferencias ·
 *   Administración · Mi perfil
 * - "Talleres" solo si `workshopMemberships.length > 0`;
 * - "Concesionarias" solo si `dealershipMemberships.length > 0`;
 * - "Administración" solo si `hasAdminAccess(user)` (workspace admin).
 * - NO hay items de Atenciones en el nav (F-023: son quick actions del
 *   dashboard, no del shell).
 * - "Historial" y "Documentos" NO son items de nav: son vistas del vehículo
 *   (`/vehicles/[id]`), no módulos globales (no se inventan rutas).
 *
 * El contexto activo (WORKSHOP/DEALERSHIP) se deriva de la ruta vía
 * `useRouteDerivedContext` (detalles `/dealerships/<uuid>` y
 * `/workshops/<uuid>`); el chip `ContextChip` lo muestra y permite volver
 * a PERSONAL con la ✕. "Inicio" (/dashboard) NO limpia el contexto.
 *
 * Notas de contrato con tests (NO romper `dashboard-layout.test.tsx`):
 * - Un SOLO link "Autentia" en el DOM (marca del sidebar; en el header
 *   mobile es texto plano, no link).
 * - El drawer se renderiza solo cuando está abierto → no duplica links.
 * - El layout NO usa `useSearchParams`/`vehicleApi` (el test de
 *   `next/navigation`/`@/lib/api` solo mockea lo mínimo).
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContextChip } from "@/components/layout/context-chip";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { AccountMenu } from "@/components/layout/account-menu";
import { buildNavSections } from "@/components/layout/nav-config";
import { useAuth } from "@/hooks/use-auth";
import { useRouteDerivedContext } from "@/hooks/use-route-derived-context";
import { hasAdminAccess } from "@/lib/admin-access";
import { authApi } from "@/lib/api";

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

  // Cerrar el drawer mobile al cambiar de ruta — patrón de ajuste durante
  // render (React: "adjusting state when a prop changes"), sin effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  // Session lost (expired cookies, refresh failure) → redirect to login
  // preserving the intended destination (RF-3).
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(
        `/login?next=${encodeURIComponent(window.location.pathname)}`,
      );
    }
  }, [status, router]);

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

  const userName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Mi cuenta"
    : "Mi cuenta";

  // PM §29 (D-105): "Concesionarias" solo se renderiza cuando el usuario
  // tiene `dealershipMemberships` (datos de sesión — no permisos genéricos).
  const sections = buildNavSections({
    hasWorkshops: (user?.workshopMemberships?.length ?? 0) > 0,
    hasDealerships: (user?.dealershipMemberships?.length ?? 0) > 0,
    // Onboarding administrado de concesionaria: "Administración" (workspace
    // admin) solo para roles/permisos de plataforma (UX — el backend enforcea).
    isAdmin: hasAdminAccess(user),
  });

  return (
    <div className="min-h-screen">
      {/* Sidebar desktop (≥ lg) — en mobile queda fuera del árbol de
          accesibilidad vía `hidden`; su rol lo cumple el drawer. */}
      <AppSidebar
        sections={sections}
        pathname={pathname}
        initials={initials}
        userName={userName}
        onLogout={handleLogout}
      />

      <div className="flex min-h-screen flex-col lg:pl-60">
        {/* Header compacto */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-screen-xl items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                id="mobile-nav-trigger"
                onClick={() => setMobileOpen(!mobileOpen)}
                className="h-11 w-11 shrink-0 lg:hidden"
                aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav-drawer"
              >
                {mobileOpen ? (
                  <X className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden="true" />
                )}
              </Button>
              {/* Marca en mobile: texto plano (el link "Autentia" vive en
                  el sidebar; no se duplica el nombre accesible). */}
              <span className="text-base font-bold tracking-tight lg:hidden">
                Autentia
              </span>
              <ContextChip />
            </div>

            <AccountMenu
              userName={userName}
              initials={initials}
              onLogout={handleLogout}
            />
          </div>
        </header>

        <main className="flex-1 bg-muted/30">
          <div className="mx-auto w-full max-w-screen-xl px-4 py-6">
            {children}
          </div>
        </main>
      </div>

      {/* Drawer mobile — solo se monta cuando está abierto. */}
      <MobileNavDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sections={sections}
        pathname={pathname}
        initials={initials}
        userName={userName}
        onLogout={handleLogout}
      />
    </div>
  );
}
