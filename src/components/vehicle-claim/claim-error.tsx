import Link from "next/link";
import { AlertCircle, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { claimTerminalCopy, type ClaimTerminalKind } from "@/lib/vehicle-claim-errors";

/**
 * Pantalla terminal del wizard de reclamo (F-1, copy §1.11 + §1.7 + 429).
 *
 * Mismo componente para todos los estados: ícono en círculo `bg-destructive/10`
 * (§1.11), título `text-xl font-semibold`, cuerpo centrado. `Lock` para
 * `locked`/`rate_limited` (§1.7), `AlertCircle` para el resto.
 *
 * CTAs por variante:
 * - `single`   → `Volver al inicio` (outline).
 * - `retry`    → `Reintentar` (outline + RotateCcw) + `Volver al inicio` (ghost).
 * - `recover`  → `Verificar de nuevo` (default) — vuelve al bootstrap.
 */
export function ClaimError({
  kind,
  onRetry,
}: {
  kind: ClaimTerminalKind;
  /** Reintentar / verificar de nuevo (re-bootstrap del link). */
  onRetry?: () => void;
}) {
  const { title, body, icon, variant } = claimTerminalCopy(kind);
  const Icon = icon === "lock" ? Lock : AlertCircle;

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10"
          aria-hidden="true"
        >
          <Icon className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
      </CardHeader>
      <CardContent>
        <p className="text-center text-sm text-muted-foreground">{body}</p>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        {variant === "retry" && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onRetry}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reintentar
          </Button>
        )}
        {variant === "recover" ? (
          <Button
            type="button"
            className="w-full"
            onClick={onRetry}
          >
            Verificar de nuevo
          </Button>
        ) : (
          <Link href="/" className="w-full">
            <Button
              type="button"
              variant={variant === "retry" ? "ghost" : "outline"}
              className="w-full"
            >
              Volver al inicio
            </Button>
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
