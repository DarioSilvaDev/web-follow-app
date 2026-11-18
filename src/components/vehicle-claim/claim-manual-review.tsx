import Link from "next/link";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Contenido de revisión manual (F-1, copy §1.10). El título
 * `Tu reclamo está en revisión` lo pinta el `ClaimWizard` (paso 3).
 *
 * Copy literal: sin promesa de plazo exacto (§1.10 "Prohibido"). Se llega
 * desde el commit con `manual_review` o desde un bootstrap en ese estado.
 */
export function ClaimManualReview() {
  return (
    <div className="grid gap-4">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted"
        aria-hidden="true"
      >
        <Clock className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Recibimos tu reclamo y un especialista va a revisarlo. Te avisamos por
        email cuando esté listo.
      </p>
      <p className="text-center text-xs text-muted-foreground">
        Si necesitás ayuda, contactá al taller donde hiciste la última
        atención.
      </p>
      <Link href="/" className="w-full">
        <Button type="button" variant="outline" className="w-full">
          Volver al inicio
        </Button>
      </Link>
    </div>
  );
}
