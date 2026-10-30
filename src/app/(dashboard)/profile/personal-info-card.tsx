"use client";

import { useState } from "react";
import { Building2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import type { SessionUser } from "@/types/auth";

/**
 * Datos personales (solo lectura) — /profile.
 *
 * Fuente única: SessionUser (GET /auth/me vía useAuth). Sin llamadas API
 * nuevas ni endpoints inventados. La edición de datos personales NO está en
 * este alcance (requiere endpoint/decisión de producto — ver nota al final).
 */

// ── Mappings de presentación (valores reales del backend) ───────────────────

/**
 * UserStatus real del backend (Prisma enum, verificado en schema/migraciones):
 * pending | active | suspended. Solo presentación — el enforcement es server-side.
 */
const ACCOUNT_STATUS: Record<
  string,
  { label: string; variant: "success" | "warning" | "destructive" | "outline" }
> = {
  active: { label: "Activo", variant: "success" },
  pending: { label: "Pendiente", variant: "warning" },
  suspended: { label: "Suspendido", variant: "destructive" },
};

/**
 * Idioma: `language` es un string libre con default "es" (contracto backend).
 * Se muestran los códigos conocidos en español; el resto se muestra tal cual.
 */
const LANGUAGE_LABELS: Record<string, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
};

function accountStatusBadge(status: string) {
  return (
    ACCOUNT_STATUS[status] ?? { label: status, variant: "outline" as const }
  );
}

function formatLanguage(language: string): string {
  return LANGUAGE_LABELS[language] ?? language;
}

// ── Subcomponentes locales ──────────────────────────────────────────────────

/**
 * Avatar con cadena de fallback: avatarUrl → img (con onError) → iniciales
 * → icono genérico. Mismo patrón de iniciales que el header del dashboard.
 */
function ProfileAvatar({ user }: { user: SessionUser }) {
  const [imgFailed, setImgFailed] = useState(false);

  const fullName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const initials = [user.firstName?.[0], user.lastName?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase();

  if (user.avatarUrl && !imgFailed) {
    return (
      // Signed R2 URL (host desconocido a build-time) → <img> nativo,
      // mismo criterio que vehicles/[id] y dealership-exhibition-section.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt={fullName ? `Foto de ${fullName}` : "Foto de perfil"}
        onError={() => setImgFailed(true)}
        className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-foreground/10"
      />
    );
  }

  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium"
      aria-hidden
    >
      {initials || <UserRound className="h-5 w-5" />}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function PersonalInfoSkeleton() {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UserRound className="h-4 w-4" aria-hidden="true" />
          Datos personales
        </h2>
        <CardDescription>Cargando tu información…</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
          <div className="grid flex-1 gap-2">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-52 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="grid gap-1.5">
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Card principal ──────────────────────────────────────────────────────────

export function PersonalInfoCard() {
  const { status, user } = useAuth();

  if (status === "loading") {
    return <PersonalInfoSkeleton />;
  }

  // Mismo criterio que DashboardPage: sin usuario no se renderiza la card
  // (el layout ya redirige a /login cuando la sesión es inválida).
  if (!user) return null;

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    "Usuario";

  const roles = user.roles ?? [];
  const workshops = user.workshopMemberships ?? [];
  const dealerships = user.dealershipMemberships ?? [];
  const hasMemberships = workshops.length > 0 || dealerships.length > 0;
  const statusBadge = accountStatusBadge(user.status);

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UserRound className="h-4 w-4" aria-hidden="true" />
          Datos personales
        </h2>
        <CardDescription>Información de tu cuenta.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {/* Identidad: avatar + nombre + email (lo más escaneable primero) */}
        <div className="flex items-center gap-3">
          <ProfileAvatar user={user} />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{fullName}</p>
            <p className="truncate text-sm text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>

        {/* Campos en grilla 2 columnas (1 en mobile) */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Alias">
            {user.alias ? (
              <span className="break-all">@{user.alias}</span>
            ) : (
              <span className="text-muted-foreground">Sin alias</span>
            )}
          </Field>
          <Field label="Idioma">{formatLanguage(user.language)}</Field>
          <Field label="Estado de la cuenta">
            <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
          </Field>
          <Field label="Roles">
            {roles.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {roles.map((role) => (
                  <Badge key={role.id} variant="outline">
                    {role.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Field>
        </div>

        {/* Membresías (taller / concesionaria) — solo si existen, sin saturar */}
        {hasMemberships && (
          <Field label="Membresías">
            <ul className="grid gap-1.5">
              {workshops.map((membership) => (
                <li
                  key={`workshop-${membership.workshopId}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{membership.workshop.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    · {membership.role.name}
                  </span>
                </li>
              ))}
              {dealerships.map((membership) => (
                <li
                  key={`dealership-${membership.dealershipId}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{membership.dealershipName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    · {membership.role.name}
                  </span>
                </li>
              ))}
            </ul>
          </Field>
        )}
      </CardContent>
    </Card>
  );
}
