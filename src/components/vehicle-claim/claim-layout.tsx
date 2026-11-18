import Link from "next/link";

/**
 * Shell centrado del wizard público de reclamo (F-1, copy §1.1).
 *
 * Mismo patrón que `InvitationLayout` (/invitations/[token]): marca Autentia,
 * card `max-w-2xl` (hay formulario de varios pasos) y fondo muted. El
 * `aria-label` de la marca es literal del spec §5.
 */
export function ClaimLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-10">
      <Link
        href="/"
        aria-label="Ir al inicio de Autentia"
        className="mb-6 flex flex-col items-center gap-0.5 transition-opacity hover:opacity-80"
      >
        <span className="text-xl font-bold tracking-tight text-foreground">
          Autentia
        </span>
        <span className="text-xs text-muted-foreground">
          Historia auténtica de tu vehículo
        </span>
      </Link>
      <div className="w-full max-w-2xl">{children}</div>
    </div>
  );
}
