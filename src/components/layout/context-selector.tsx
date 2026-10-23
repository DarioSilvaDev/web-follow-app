"use client";

import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import {
  clearActiveContext,
  selectDealership,
  selectWorkshop,
} from "@/lib/active-context";
import { dealershipRoleLabel } from "@/lib/consignment";

/**
 * Selector ÚNICO de contexto activo en el header del dashboard.
 *
 * Unifica los anteriores WorkshopSelector + DealershipSelector, que se
 * renderizaban como dos <select> vecinos y confundían al usuario (doble
 * "Personal"). La data ya viene toda de `/auth/me`
 * (`workshopMemberships` + `dealershipMemberships`); el backend modela un
 * ÚNICO contexto activo por request (ContextGuard + headers
 * `X-Context-Type`/`X-Context-Id`), así que la UI debe reflejar eso.
 *
 * - Opciones: "Personal" + una por taller (optgroup "Talleres") + una por
 *   concesionaria (optgroup "Concesionarias").
 * - Valores prefijados (`workshop:` / `dealership:`) para que un id no
 *   colisione con el otro.
 * - Cambiar de contexto reemplaza el activo directamente (selectWorkshop /
 *   selectDealership no dependen del contexto previo); "Personal" limpia.
 * - Contexto por-sesión en memoria (D-021 PENDING: sin persistencia).
 * - Sin membresías → no renderiza nada (journey PERSONAL intacto).
 */

const WORKSHOP_PREFIX = "workshop:";
const DEALERSHIP_PREFIX = "dealership:";

export function ContextSelector() {
  const { user } = useAuth();
  const activeContext = useActiveContext();

  const workshops = user?.workshopMemberships ?? [];
  const dealerships = user?.dealershipMemberships ?? [];
  if (workshops.length === 0 && dealerships.length === 0) {
    return null;
  }

  const value =
    activeContext?.type === "WORKSHOP"
      ? WORKSHOP_PREFIX + activeContext.workshopId
      : activeContext?.type === "DEALERSHIP"
        ? DEALERSHIP_PREFIX + activeContext.dealershipId
        : "";

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (next === "") {
      clearActiveContext();
    } else if (next.startsWith(WORKSHOP_PREFIX)) {
      selectWorkshop(next.slice(WORKSHOP_PREFIX.length));
    } else if (next.startsWith(DEALERSHIP_PREFIX)) {
      selectDealership(next.slice(DEALERSHIP_PREFIX.length));
    }
  };

  return (
    <select
      id="active-context-select"
      aria-label="Contexto activo"
      value={value}
      onChange={handleChange}
      className="h-7 max-w-[190px] rounded-lg border border-input bg-transparent px-2 text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <option value="">Personal</option>
      {workshops.length > 0 && (
        <optgroup label="Talleres">
          {workshops.map((membership) => (
            <option key={membership.workshopId} value={WORKSHOP_PREFIX + membership.workshopId}>
              {membership.workshop.name} ({membership.role.name})
            </option>
          ))}
        </optgroup>
      )}
      {dealerships.length > 0 && (
        <optgroup label="Concesionarias">
          {dealerships.map((membership) => (
            <option
              key={membership.dealershipId}
              value={DEALERSHIP_PREFIX + membership.dealershipId}
            >
              {membership.dealershipName} (
              {dealershipRoleLabel(membership.role.code)})
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
