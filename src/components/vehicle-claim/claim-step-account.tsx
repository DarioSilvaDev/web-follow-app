"use client";

/**
 * Contenido del paso de cuenta (F-1, copy §1.8). El título/subtítulo los
 * pinta el `ClaimWizard`.
 *
 * Dos variantes según la sesión:
 * - SIN sesión → registro: CTA primario `Crear cuenta y reclamar` +
 *   secundario `Iniciá sesión…` es decir `Ingresar y reclamar`.
 * - `authRequired` (el commit respondió 401 y no se pudo restaurar la
 *   sesión) → login: único CTA primario `Ingresar y reclamar`.
 *
 * Al tocar el CTA de registro se muestra el aviso literal §1.8
 * (`Te llevamos a crear tu cuenta…`) y el orchestrator navega con
 * `?next=/reclamo/<token>` tras 1000 ms. El CTA de login navega en el mismo
 * tick. Ambos usan navegación client-side para que el ticket en memoria
 * sobreviva el round-trip (ver vehicle-claim-ticket.ts).
 */
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

export function ClaimStepAccount({
  mode,
  showAviso,
  onRegister,
  onLogin,
}: {
  mode: "register" | "login";
  /** Aviso previo al redirect de registro (§1.8). */
  showAviso: boolean;
  onRegister: () => void;
  onLogin: () => void;
}) {
  const isLogin = mode === "login";

  return (
    <div className="grid gap-4">
      {showAviso && (
        <Callout variant="info" role="status">
          Te llevamos a crear tu cuenta. Cuando termines, volvés acá
          automáticamente.
        </Callout>
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          disabled={showAviso}
          onClick={isLogin ? onLogin : onRegister}
        >
          {isLogin ? "Ingresar y reclamar" : "Crear cuenta y reclamar"}
        </Button>
        {!isLogin && (
          <Button
            type="button"
            variant="outline"
            disabled={showAviso}
            onClick={onLogin}
          >
            Ingresar y reclamar
          </Button>
        )}
        <p className="text-center text-xs text-muted-foreground">
          Tus datos se usan sólo para vincular el historial a tu nombre.
        </p>
      </div>
    </div>
  );
}
