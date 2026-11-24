"use client";

/**
 * Banner global de impersonación — shell autenticado ((dashboard)/layout.tsx).
 *
 * Solo renderiza cuando `/auth/me` trae `impersonated === true` (sesión
 * firmada con el token de impersonación; ver auth/me en api). En cualquier
 * otra sesión devuelve null.
 *
 * - Franja amber full-width, sticky top-0, UNA sola línea (h-11): el header
 *   sticky del shell compensa su top vía --impersonation-offset (layout
 *   raíz). `truncate` solo afecta lo visual; el texto completo lo leen los
 *   lectores de pantalla.
 * - Copy permanente; ante un error de stop-impersonate, la línea de la
 *   izquierda muestra el error (role="alert" en el contenedor) y el botón
 *   sigue disponible para reintentar.
 * - "Dejar de impersonar": POST /auth/stop-impersonate (cookie httpOnly,
 *   403 si la sesión no es impersonación). Éxito → clearActiveContext()
 *   (PERSONAL; D-021) + navegación COMPLETA a la ruta actual (full reload:
 *   re-bootstrapea la cookie admin recién firmada — router.push no basta, y
 *   el cache de TanStack Query muere con el reload, sin mezcla de datos).
 *
 * Sin dependencias de TanStack Query a propósito: el banner se monta en el
 * shell y debe funcionar igual sin ese provider (y es más fácil de testear).
 */
import { useState } from "react";
import { Loader2, TriangleAlert, Undo2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { clearActiveContext } from "@/lib/active-context";
import { resolveStopImpersonateError } from "@/lib/admin-errors";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user?.impersonated) {
    return null;
  }

  const handleStop = async () => {
    setError(null);
    setPending(true);
    try {
      await authApi.stopImpersonate();
      clearActiveContext();
      // Navegación completa a la ruta actual (con query string): la app
      // re-bootstrapea como el admin. Si la ruta ya no es accesible tras
      // volver a ser admin, la propia página muestra su estado de error.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(
        `${window.location.pathname}${window.location.search}`,
      );
    } catch (err) {
      setError(resolveStopImpersonateError(err));
      setPending(false);
    }
  };

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email;
  const fullCopy = `Impersonando a ${displayName}. Las acciones que hagas se atribuyen a esa cuenta.`;

  return (
    <div
      role="alert"
      className="sticky top-0 z-40 h-11 shrink-0 border-b border-warning/60 bg-warning/15 text-foreground"
    >
      <div className="mx-auto flex h-full w-full max-w-screen-xl items-center gap-2 px-4">
        <TriangleAlert
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-warning"
        />
        <p
          className="min-w-0 flex-1 truncate text-sm"
          title={error ?? fullCopy}
        >
          {error ? (
            <span className="font-medium text-destructive">{error}</span>
          ) : (
            <>
              <span className="font-semibold">Impersonando a {displayName}.</span>{" "}
              <span className="hidden sm:inline">
                Las acciones que hagas se atribuyen a esa cuenta.
              </span>
            </>
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 border-warning/60 bg-background/80 text-xs hover:bg-background"
          disabled={pending}
          onClick={() => void handleStop()}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Dejar de impersonar
        </Button>
      </div>
    </div>
  );
}
