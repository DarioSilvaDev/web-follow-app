import type { Badge } from "@/components/ui/badge";
import type { VehicleClaimStatus } from "@/types/vehicle-claim";

// Badge por estado efectivo (compartido entre /reclamos y /reclamos/[id]).
export type ClaimBadgeVariant = React.ComponentProps<typeof Badge>["variant"];

export const CLAIM_STATUS_BADGES: Record<
  VehicleClaimStatus,
  { label: string; variant: ClaimBadgeVariant }
> = {
  pending: { label: "Vigente", variant: "success" },
  verification_required: { label: "Vigente", variant: "success" },
  verified: { label: "Vigente", variant: "success" },
  manual_review: { label: "A revisar", variant: "warning" },
  claimed: { label: "Reclamado", variant: "info" },
  claim_blocked: { label: "Bloqueado", variant: "destructive" },
  expired: { label: "Vencido", variant: "secondary" },
  revoked: { label: "Revocado", variant: "secondary" },
};
