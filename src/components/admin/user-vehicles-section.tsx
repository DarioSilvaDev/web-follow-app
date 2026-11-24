"use client";

/**
 * Sección "Vehículos" del perfil 360 de un usuario (tab del detalle
 * /admin/users/[id]).
 *
 * Dos grupos, ambos de SOLO LECTURA (la tenencia/los accesos se gestionan
 * desde los flujos de vehículo/transferencia, no desde el panel admin):
 * - "Propios": tenencias vigentes (`vehicles` del detalle admin; endsAt null).
 *   `ownershipType`: owner | co_owner | company. `dealershipName` ≠ null →
 *   la tenencia es consignación de una concesionaria.
 * - "Con acceso": accesos vigentes a vehículos de terceros (`vehicleAccesses`).
 *
 * NO existen rutas admin de detalle de vehículo; el texto de la patente es
 * plano a propósito (no se inventan rutas).
 */
import { Car, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatAdminDate } from "@/lib/admin-status";
import type {
  AdminUserVehicleAccess,
  AdminUserVehicleSummary,
} from "@/types/admin";

function vehicleLabel(item: {
  brand: string | null;
  model: string | null;
  version?: string | null;
}): string {
  return (
    [item.brand, item.model, item.version].filter(Boolean).join(" ") || "—"
  );
}

const OWNERSHIP_MAP: Record<
  string,
  { label: string; variant: "success" | "info" | "secondary" }
> = {
  owner: { label: "Titular", variant: "success" },
  co_owner: { label: "Co-titular", variant: "info" },
  company: { label: "Concesionaria", variant: "secondary" },
};

export interface UserVehiclesSectionProps {
  vehicles: AdminUserVehicleSummary[];
  vehicleAccesses: AdminUserVehicleAccess[];
}

export function UserVehiclesSection({
  vehicles,
  vehicleAccesses,
}: UserVehiclesSectionProps) {
  const isEmpty = vehicles.length === 0 && vehicleAccesses.length === 0;

  if (isEmpty) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={Car}
            compact
            title="Sin vehículos"
            description="Este usuario no tiene vehículos a su nombre ni accesos vigentes a vehículos de terceros."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Propios */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Propios ({vehicles.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tiene vehículos a su nombre.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Vehículos a nombre del usuario (tenencias vigentes)
              </caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Patente
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Vehículo
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Año
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Tenencia
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Desde
                  </th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((item) => {
                  const ownership = OWNERSHIP_MAP[item.ownershipType] ?? {
                    label: item.ownershipType,
                    variant: "secondary" as const,
                  };
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-3 py-2.5 font-mono font-medium text-foreground">
                        {item.licensePlate}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-foreground">
                          {vehicleLabel(item)}
                        </span>
                        {item.dealershipName && (
                          <span className="block text-xs text-muted-foreground">
                            Consignación de {item.dealershipName}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {item.manufactureYear ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={ownership.variant}>
                          {ownership.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {formatAdminDate(item.startsAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Con acceso */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Con acceso ({vehicleAccesses.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {vehicleAccesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tiene accesos vigentes a vehículos de terceros.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Accesos vigentes a vehículos de terceros
              </caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Patente
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Vehículo
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Otorgado por
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Expira
                  </th>
                </tr>
              </thead>
              <tbody>
                {vehicleAccesses.map((access) => (
                  <tr
                    key={access.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-3 py-2.5 font-mono font-medium text-foreground">
                      {access.licensePlate}
                    </td>
                    <td className="px-3 py-2.5 text-foreground">
                      {vehicleLabel(access)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-foreground">
                        {access.grantedByName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {access.grantedByEmail}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {access.expiresAt
                        ? formatAdminDate(access.expiresAt)
                        : "Sin vencimiento"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
