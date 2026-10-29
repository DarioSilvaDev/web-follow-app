/**
 * Secciones de navegación compartidas entre el sidebar desktop y el drawer
 * mobile. Presentacional: recibe la config ya filtrada y los helpers de
 * estado activo desde el layout (que es quien conoce el pathname).
 */

import Link from "next/link";
import { cn } from "cn";
import type { NavSection } from "./nav-config";
import { isNavItemActive, navItemAriaCurrent } from "./nav-config";

interface NavSectionsProps {
  sections: NavSection[];
  pathname: string;
  /** Cierra el drawer mobile tras navegar (no-op en sidebar desktop). */
  onNavigate?: () => void;
  /** Variante visual: "sidebar" (fondo azul profundo) o "drawer". */
  tone?: "on-primary";
}

export function NavSections({
  sections,
  pathname,
  onNavigate,
  tone = "on-primary",
}: NavSectionsProps) {
  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-6 px-3">
      {sections.map((section, index) => (
        <div key={section.title ?? `section-${index}`}>
          {section.title && (
            <p
              className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/70"
              aria-hidden="true"
            >
              {section.title}
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const active = isNavItemActive(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={navItemAriaCurrent(pathname, item)}
                    onClick={onNavigate}
                    className={cn(
                      "relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/70",
                      tone === "on-primary" &&
                        (active
                          ? "bg-primary-foreground/10 font-medium text-primary-foreground"
                          : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"),
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary-foreground"
                      />
                    )}
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
