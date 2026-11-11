import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Contenido de éxito del reclamo (F-1, copy §1.9). El título
 * `¡Vehículo reclamado!` lo pinta el `ClaimWizard` (paso 3).
 *
 * `{patente}` viene del ticket guardado en el verify — es el primer momento
 * en que la UI puede mostrar datos del vehículo (§0 regla 7). `vehicleId` se
 * decodifica del propio ticket; si el decode falla se oculta el CTA primario
 * y sólo queda `Ir al inicio` (nunca se inventa un destino).
 *
 * NOTA (gap reportado): el copy apunta a `/vehicles/{vehicleId}/servicios`,
 * ruta que NO existe en el frontend (sólo `servicios/nueva` y
 * `servicios/[servicioId]`); se usa `/vehicles/{vehicleId}` — el detalle del
 * vehículo — hasta que producto defina la ruta.
 */
export function ClaimSuccess({
  licensePlate,
  vehicleId,
}: {
  licensePlate: string;
  vehicleId: string | null;
}) {
  return (
    <div className="grid gap-4">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10"
        aria-hidden="true"
      >
        <CheckCircle2 className="h-6 w-6 text-success" />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        El historial de {licensePlate} ya está a tu nombre. Podés consultarlo
        cuando quieras desde Mis vehículos.
      </p>
      <div className="flex flex-col gap-2">
        {vehicleId && (
          <Link href={`/vehicles/${vehicleId}`} className="w-full">
            <Button type="button" className="w-full">
              Ver el historial
            </Button>
          </Link>
        )}
        <Link href="/" className="w-full">
          <Button
            type="button"
            variant={vehicleId ? "outline" : "default"}
            className="w-full"
          >
            Ir al inicio
          </Button>
        </Link>
      </div>
    </div>
  );
}
