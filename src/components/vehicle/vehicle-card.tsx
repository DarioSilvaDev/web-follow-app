"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Car, Gauge, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Vehicle } from "@/types/vehicle";

interface VehicleCardProps {
  vehicle: Vehicle;
  isOwner?: boolean;
}

/**
 * Render the catalog triplet. D-038: without a catalog selection the UI
 * shows "—". The backend is migrating the list contract to denormalized
 * brand/model/version (F-010 §9), so missing values are tolerated.
 * Exportado: lo reutilizan el selector y el hero del dashboard.
 */
export function catalogLabel(vehicle: Vehicle): string {
  const parts = [vehicle.brand, vehicle.model, vehicle.version].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return parts.length > 0 ? parts.join(" ") : "—";
}

export function yearsLabel(vehicle: Vehicle): string {
  const years = [vehicle.manufactureYear, vehicle.modelYear].filter(
    (year): year is number => typeof year === "number",
  );
  return years.length > 0 ? years.join(" / ") : "—";
}

export function VehicleCard({ vehicle, isOwner = false }: VehicleCardProps) {
  const router = useRouter();

  const latestMileage =
    vehicle.mileages && vehicle.mileages.length > 0
      ? vehicle.mileages[0]
      : null;

  return (
    <div className="relative rounded-xl ring-1 ring-border transition-all hover:shadow-md hover:ring-primary/30 focus-within:ring-2 focus-within:ring-ring/60">
      {/* Ancla nativa: navegable por teclado y con botón medio/ctrl (link real,
          no un div con role="link"). El click izquierdo usa el router del
          cliente. Se evita <Link> envolviendo toda la card porque el botón
          "Editar" vive como HERMANO (un <a> dentro de otro <a> es inválido). */}
      <a
        href={`/vehicles/${vehicle.id}`}
        aria-label={`Ver detalle de ${vehicle.licensePlate}`}
        className="block cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        onClick={(event) => {
          event.preventDefault();
          router.push(`/vehicles/${vehicle.id}`);
        }}
      >
        <Card className="border-0 shadow-none ring-0">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Car className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">
                    {vehicle.licensePlate}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {catalogLabel(vehicle)}
                  </CardDescription>
                </div>
              </div>
              {latestMileage && (
                <Badge variant="secondary" className="font-mono text-xs">
                  <Gauge className="mr-1 h-3 w-3" aria-hidden="true" />
                  {latestMileage.mileage.toLocaleString("es-AR")} km
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Año: <span className="text-foreground">{yearsLabel(vehicle)}</span>
              </span>
              {vehicle.color && (
                <span>
                  Color: <span className="text-foreground">{vehicle.color}</span>
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </a>
      {isOwner && (
        <div className="px-6 pb-5">
          <Link href={`/vehicles/${vehicle.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Editar
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
