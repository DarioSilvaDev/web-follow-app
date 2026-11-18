"use client";

/**
 * Selector del vehículo ACTIVO del dashboard — control principal del header
 * del dashboard (mobile-first, targets ≥ 44px, usable con una mano).
 *
 * - Listbox propio (sin librería nueva): trigger con `aria-haspopup=
 *   "listbox"`, `aria-expanded` y `aria-controls`; opciones con `role=
 *   "option"` + `aria-selected`; navegación con flechas, Enter/Espacio,
 *   Escape y click fuera.
 * - La selección se emite vía `onSelect(id)`; la persistencia la decide la
 *   página (searchParams `?v=` — sin localStorage, regla del brief).
 * - No renderiza nada sin vehículos: el estado vacío lo maneja la página.
 */

import { useEffect, useRef, useState } from "react";
import { Car, Check, ChevronDown } from "lucide-react";
import { catalogLabel, yearsLabel } from "@/components/vehicle/vehicle-card";
import { cn } from "cn";
import type { Vehicle } from "@/types/vehicle";

interface VehicleSelectorProps {
  vehicles: Vehicle[];
  /** Id del vehículo activo (null/undefined → sin seleccionar). */
  activeVehicleId?: string | null;
  onSelect: (vehicleId: string) => void;
  className?: string;
}

export function VehicleSelector({
  vehicles,
  activeVehicleId,
  onSelect,
  className,
}: VehicleSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const activeVehicle =
    vehicles.find((vehicle) => vehicle.id === activeVehicleId) ?? null;

  // Click fuera → cerrar.
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

  // Escape → cerrar y devolver foco al trigger.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Al abrir: foco en la opción activa (o la primera).
  useEffect(() => {
    if (!open) return;
    const options = listRef.current?.querySelectorAll<HTMLElement>(
      '[role="option"]',
    );
    if (!options || options.length === 0) return;
    const selected = listRef.current?.querySelector<HTMLElement>(
      '[role="option"][aria-selected="true"]',
    );
    (selected ?? options[0]).focus();
  }, [open]);

  const handleSelect = (vehicleId: string) => {
    setOpen(false);
    triggerRef.current?.focus();
    onSelect(vehicleId);
  };

  const handleOptionKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    vehicleId: string,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSelect(vehicleId);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const options = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ??
          [],
      );
      const index = options.indexOf(event.currentTarget);
      const next =
        event.key === "ArrowDown"
          ? options[Math.min(index + 1, options.length - 1)]
          : options[Math.max(index - 1, 0)];
      next?.focus();
    }
  };

  const title = activeVehicle
    ? catalogLabel(activeVehicle)
    : "Elegí un vehículo";
  const subtitle = activeVehicle
    ? [
        yearsLabel(activeVehicle),
        activeVehicle.color,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Se muestra su historia y trazabilidad";

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="vehicle-selector-list"
        aria-label={
          activeVehicle
            ? `Vehículo activo: ${title} ${activeVehicle.licensePlate}. Cambiar vehículo`
            : "Elegí un vehículo"
        }
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"
        >
          <Car className="h-4.5 w-4.5 text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Vehículo activo
          </span>
          <span className="block truncate text-sm font-semibold">
            {activeVehicle ? title : "Elegí un vehículo"}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {activeVehicle ? subtitle : "Se muestra su historia y trazabilidad"}
          </span>
        </span>
        {activeVehicle && (
          <span className="shrink-0 rounded-md border border-border bg-muted/60 px-2 py-1 font-mono text-xs font-semibold">
            {activeVehicle.licensePlate}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <ul
          id="vehicle-selector-list"
          ref={listRef}
          role="listbox"
          aria-label="Vehículos disponibles"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-md"
        >
          {vehicles.map((vehicle) => {
            const selected = vehicle.id === activeVehicleId;
            return (
              <li
                key={vehicle.id}
                role="option"
                aria-selected={selected}
                tabIndex={0}
                onClick={() => handleSelect(vehicle.id)}
                onKeyDown={(event) => handleOptionKeyDown(event, vehicle.id)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "bg-primary/10" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {catalogLabel(vehicle)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {yearsLabel(vehicle)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs font-semibold">
                  {vehicle.licensePlate}
                </span>
                {selected && (
                  <Check
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-success"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
