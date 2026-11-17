"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { vehicleApi } from "@/lib/api";

interface VehicleCardProps {
  vehicle: Vehicle;
  isOwner?: boolean;
}

/**
 * Render the catalog label (marca + modelo). D-038: without a catalog
 * selection the UI shows "—". El MVP no usa versiones de vehículo; el
 * backend puede seguir mandando `version` por compatibilidad, pero no se
 * muestra. Exportado: lo reutilizan el selector y el hero del dashboard.
 */
export function catalogLabel(vehicle: Vehicle): string {
  const parts = [vehicle.brand, vehicle.model].filter((part): part is string =>
    Boolean(part && part.trim()),
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

      const primaryPhoto =
        vehicle.photos && vehicle.photos.length > 0
          ? vehicle.photos.find((p) => p.isPrimary) ?? null
          : null;

      const [photoUrl, setPhotoUrl] = useState<string | null>(null);

      useEffect(() => {
        if (!primaryPhoto) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setPhotoUrl(null);
          return;
        }
        let cancelled = false;
        vehicleApi
          .getPhotoSignedUrl(vehicle.id, primaryPhoto.id)
          .then((url) => {
            if (!cancelled) setPhotoUrl(url.url);
          })
          .catch((error) => {
            console.error("Error fetching photo signed URL:", error);
          });
        return () => {
          cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [vehicle.id, primaryPhoto?.id]);
  return (
    <div className="relative rounded-card ring-1 ring-border transition-all hover:shadow-md hover:ring-primary/30 focus-within:ring-2 focus-within:ring-ring/60">
      {/* Ancla nativa: navegable por teclado y con botón medio/ctrl (link real,
          no un div con role="link"). El click izquierdo usa el router del
          cliente. Se evita <Link> envolviendo toda la card porque el botón
          "Editar" vive como HERMANO (un <a> dentro de otro <a> es inválido). */}
      <a
        href={`/vehicles/${vehicle.id}`}
        aria-label={`Ver detalle de ${vehicle.licensePlate}`}
        className="block cursor-pointer rounded-card outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        onClick={(event) => {
          event.preventDefault();
          router.push(`/vehicles/${vehicle.id}`);
        }}
      >
        <Card className="border-0 shadow-none ring-0">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-control bg-primary/10">
                  {photoUrl == null ?  (
                    <Car className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
                  ): (
                    // URL firmada de R2/iDrive e2 que caduca (~1 h): usamos
                    // <img> nativo (mismo criterio que photos-section), no
                    // next/image — evita configurar hosts efímeros y optimizar
                    // URLs que cambian en cada request.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt={`Foto de ${vehicle.licensePlate}`}
                      className="h-full w-full rounded-control object-cover"
                    />
                  ) }
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
                  <Gauge className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
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
