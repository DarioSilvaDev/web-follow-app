import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Autentia</h1>
        <p className="mt-2 text-muted-foreground">
          Historia auténtica de tu vehículo
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:gap-4">
        <Link
          href="/login"
          className="inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 sm:h-9 sm:w-auto"
        >
          Iniciar sesión
        </Link>
        <Link
          href="/forgot-password"
          className="inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted sm:h-9 sm:w-auto"
        >
          Recuperar contraseña
        </Link>
      </div>
    </main>
  );
}
