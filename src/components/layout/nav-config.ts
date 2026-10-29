/**
 * Configuración de la navegación del shell autenticado (sidebar desktop +
 * drawer mobile).
 *
 * Reglas:
 * - Solo rutas REALES del proyecto (no se inventan secciones): "Historial" y
 *   "Documentos/evidencias" viven dentro del detalle del vehículo
 *   (`/vehicles/[id]`), no son módulos globales → no son items de nav.
 * - "Mi perfil" (= Configuración de la cuenta) es permanente; el resto se
 *   filtra por membresías/permisos de la sesión (mismo criterio que el header
 *   anterior — D-105 / F-023).
 * - F-023: las Atenciones NO son items de nav; son quick actions del
 *   dashboard en contexto WORKSHOP.
 *
 * La visibilidad se decide en el layout (datos de sesión) y se pasa como
 * dato puro a los componentes presentacionales del shell.
 */

import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Building2,
  Car,
  LayoutDashboard,
  Shield,
  User,
  Wrench,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * `true` → match EXACTO del pathname para marcar activo/aria-current
   * (evita que "/dashboard" se marque en subrutas hipotéticas y que
   * "/profile" capture prefijos futuros). El resto usa startsWith (así
   * `/dealerships/<id>` marca "Concesionarias" y `/workshops/<id>` "Talleres").
   */
  exact?: boolean;
}

export interface NavSection {
  /** Label de sección (opcional — el primer bloque no siempre lleva título). */
  title?: string;
  items: NavItem[];
}

/** Membresías/permisos de la sesión que habilitan items del nav. */
export interface NavVisibility {
  /** Hay membresía activa de taller → item "Talleres". */
  hasWorkshops: boolean;
  /** Hay membresía de concesionaria → item "Concesionarias". */
  hasDealerships: boolean;
  /** Acceso de admin de workspace → item "Administración". */
  isAdmin: boolean;
}

/**
 * Construye las secciones del nav para la sesión actual.
 * Siempre incluye Inicio · Mis vehículos · Transferencias · Mi perfil.
 */
export function buildNavSections({
  hasWorkshops,
  hasDealerships,
  isAdmin,
}: NavVisibility): NavSection[] {
  const garage: NavItem[] = [
    { href: "/dashboard", label: "Inicio", icon: LayoutDashboard, exact: true },
    { href: "/vehicles", label: "Mis vehículos", icon: Car },
  ];

  if (hasWorkshops) {
    garage.push({ href: "/workshops", label: "Talleres", icon: Wrench });
  }
  if (hasDealerships) {
    garage.push({ href: "/dealerships", label: "Concesionarias", icon: Building2 });
  }

  const gestion: NavItem[] = [
    { href: "/transferencias", label: "Transferencias", icon: ArrowLeftRight },
  ];

  if (isAdmin) {
    gestion.push({ href: "/admin", label: "Administración", icon: Shield });
  }

  gestion.push({ href: "/profile", label: "Mi perfil", icon: User, exact: true });

  return [
    { title: "Mi garage", items: garage },
    { title: "Gestión", items: gestion },
  ];
}

/** ¿El item está activo para el pathname dado? (match exacto o por prefijo). */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname.startsWith(item.href);
}

/**
 * `aria-current` del item: "page" solo en match exacto; "true" en match por
 * prefijo (así `/dealerships/<id>` no marca aria-current="page" en
 * Concesionarias).
 */
export function navItemAriaCurrent(
  pathname: string,
  item: NavItem,
): "page" | "true" | undefined {
  if (pathname === item.href) return "page";
  return isNavItemActive(pathname, item) ? "true" : undefined;
}
