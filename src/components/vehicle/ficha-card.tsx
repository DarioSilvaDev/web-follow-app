"use client";

/**
 * Ficha del vehículo (detalle /vehicles/[id]).
 *
 * Extraída del page monolítico sin cambio de comportamiento: mismos campos,
 * mismos textos y misma tolerancia de datos (D-038). El titular activo puede
 * ser persona o concesionaria (D-107, consignación).
 */

import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import type { Vehicle } from "@/types/vehicle";

export function FichaCard({ vehicle }: { vehicle: Vehicle }) {
  // Milestone consignación (D-107): el titular ACTUAL puede ser persona
  // (type owner) o concesionaria (type company + dealership, titular
  // intermedio durante la exhibición). Se muestra el que esté vigente.
  const activeOwnership =
    vehicle.ownerships?.find((o) => !o.endsAt) ?? null;

  const ownerDisplayName = activeOwnership?.dealership?.name
    ? activeOwnership.dealership.name
    : activeOwnership?.user
      ? [activeOwnership.user.firstName, activeOwnership.user.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || "Propietario registrado"
      : "Propietario registrado";

  return (
    <Card>
      <CardHeader className="pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Identificación y propiedad
        </p>
        {/* h2 real (no CardTitle, que es un div) → encabezado semántico */}
        <h2 className="font-heading text-lg leading-snug font-medium">
          Ficha del vehículo
        </h2>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Marca / modelo / versión
          </p>
          <p className="mt-0.5 font-medium">
            {[vehicle.brand, vehicle.model, vehicle.version]
              .filter((part): part is string => Boolean(part && part.trim()))
              .join(" ") || "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Año
          </p>
          <p className="mt-0.5 font-medium">
            {[vehicle.manufactureYear, vehicle.modelYear]
              .filter((year): year is number => typeof year === "number")
              .join(" / ") || "—"}
          </p>
        </div>
        {vehicle.color ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Color
            </p>
            <p className="mt-0.5 font-medium">{vehicle.color}</p>
          </div>
        ) : null}
        {vehicle.vin ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              VIN
            </p>
            <p className="mt-0.5 font-medium">{vehicle.vin}</p>
          </div>
        ) : null}
        {vehicle.engineNumber ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Número de motor
            </p>
            <p className="mt-0.5 font-medium">{vehicle.engineNumber}</p>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Notas
          </p>
          <p className="mt-0.5 font-medium whitespace-pre-wrap">
            {vehicle.notes?.trim() || "—"}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Titular actual
          </p>
          {/* RF-2: sin exposición de PII innecesaria — solo nombre/apellido
              (el email lo controla el backend y NO se muestra). */}
          <p className="mt-0.5 font-medium">{ownerDisplayName}</p>
        </div>
      </CardContent>
    </Card>
  );
}
