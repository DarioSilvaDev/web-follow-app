"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Loader2,
  Pencil,
  Smartphone,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { usersApi } from "@/lib/api";
import type { SessionUser } from "@/types/auth";

/**
 * Datos personales — /profile. Lectura desde la sesión (GET /auth/me) +
 * edición inline (PATCH /users/me, self-service): nombre, apellido y celular.
 * Tras guardar: refreshSession() obligatorio (misma razón que alias).
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

function accountStatusBadge(status: string) {
  return (
    ACCOUNT_STATUS[status] ?? { label: status, variant: "outline" as const }
  );
}

/**
 * Celular para mostrar. NUNCA parsear E.164 para display: usar los campos
 * de display del backend. Si hay phone pero faltan los display fields
 * (legacy), mostrar el phone crudo. Sin phone → null.
 */
function formatAccountPhone(user: SessionUser): string | null {
  if (!user.phone) return null;
  const area = user.phoneAreaCode?.trim();
  const national = user.phoneNationalNumber?.trim();
  if (area && national) return `+54 ${area} ${national}`;
  return user.phone;
}

// ── Formulario de edición (RHF + zod) ───────────────────────────────────────

// D-173: celular = par área/número, país fijo +54. superRefine espeja el
// contrato backend (ambos ≥2 dígitos tras strip de no-dígitos; ambos vacíos
// = quitar el celular).
const personalInfoSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(2, "El nombre debe tener al menos 2 caracteres")
      .max(100, "El nombre es demasiado largo"),
    lastName: z
      .string()
      .trim()
      .min(2, "El apellido debe tener al menos 2 caracteres")
      .max(100, "El apellido es demasiado largo"),
    phoneAreaCode: z
      .string()
      .trim()
      .max(6, "El código de área es demasiado largo"),
    phoneNationalNumber: z
      .string()
      .trim()
      .max(12, "El número es demasiado largo"),
  })
  .superRefine((values, ctx) => {
    const areaDigits = values.phoneAreaCode.replace(/\D/g, "");
    const numberDigits = values.phoneNationalNumber.replace(/\D/g, "");
    if (areaDigits === "" && numberDigits === "") return; // quita el celular
    if (
      areaDigits === "" ||
      numberDigits === "" ||
      areaDigits.length < 2 ||
      numberDigits.length < 2
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["phoneNationalNumber"],
        message: "Ingresá un celular válido (código de área y número).",
      });
    }
  });

type PersonalInfoForm = z.infer<typeof personalInfoSchema>;

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
          {[0, 1, 2].map((i) => (
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
  const { status, user, refreshSession } = useAuth();
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstNameRef = useRef<HTMLInputElement | null>(null);
  const wasEditingRef = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields, isSubmitting },
  } = useForm<PersonalInfoForm>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phoneAreaCode: "",
      phoneNationalNumber: "",
    },
  });
  const firstNameRegistration = register("firstName");

  // Foco: al entrar a edición → input Nombre; al salir → botón "Editar".
  useEffect(() => {
    if (editing) {
      wasEditingRef.current = true;
      firstNameRef.current?.focus();
    } else if (wasEditingRef.current) {
      wasEditingRef.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  // Éxito transitorio: se auto-oculta a los 5s (patrón ProfilePage).
  useEffect(() => {
    if (feedback?.kind !== "success") return;
    const timer = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const userDefaults = (u: SessionUser): PersonalInfoForm => ({
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    phoneAreaCode: u.phoneAreaCode ?? "",
    phoneNationalNumber: u.phoneNationalNumber ?? "",
  });

  const enterEdit = () => {
    if (!user) return;
    setFeedback(null);
    reset(userDefaults(user));
    setEditing(true);
  };

  const handleCancel = () => {
    if (!user) return;
    // Descarta: reset a los valores de la sesión, sin diálogo de confirmación.
    reset(userDefaults(user));
    setFeedback(null);
    setEditing(false);
  };

  const onFormKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
    }
  };

  const onSubmit = async (data: PersonalInfoForm) => {
    if (!user) return;
    setFeedback(null);

    // Enviar SOLO campos modificados (dirtyFields).
    const input: Parameters<typeof usersApi.updateMyProfile>[0] = {};
    if (dirtyFields.firstName) input.firstName = data.firstName.trim();
    if (dirtyFields.lastName) input.lastName = data.lastName.trim();
    if (dirtyFields.phoneAreaCode || dirtyFields.phoneNationalNumber) {
      const areaDigits = data.phoneAreaCode.replace(/\D/g, "");
      const numberDigits = data.phoneNationalNumber.replace(/\D/g, "");
      input.phone =
        areaDigits === "" && numberDigits === ""
          ? null // ambos vacíos → quita el celular
          : { areaCode: areaDigits, nationalNumber: numberDigits };
    }
    if (Object.keys(input).length === 0) {
      setEditing(false);
      return;
    }

    try {
      await usersApi.updateMyProfile(input);
      reset({
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        phoneAreaCode: data.phoneAreaCode.trim(),
        phoneNationalNumber: data.phoneNationalNumber.trim(),
      });
      setEditing(false);
      // El alias quedó stale tras PATCH; refreshSession recarga GET /auth/me.
      void refreshSession();
      setFeedback({
        kind: "success",
        text: "Tus datos personales se guardaron.",
      });
    } catch (err) {
      const error = err as { status?: number; message?: string };
      if (error?.status === 400) {
        const message = error.message ?? "";
        const phoneLike = /celular|área|numero|número|phone/i.test(message);
        setFeedback({
          kind: "error",
          text: phoneLike
            ? "Ingresá un celular válido (código de área y número)."
            : "Revisá los datos e intentá de nuevo.",
        });
      } else {
        setFeedback({
          kind: "error",
          text: "No pudimos guardar tus datos. Intentá de nuevo.",
        });
      }
    }
  };

  if (status === "loading") {
    return <PersonalInfoSkeleton />;
  }

  // Mismo criterio que DashboardPage: sin usuario no se renderiza la card
  // (el layout ya redirige a /login cuando la sesión es inválida).
  if (!user) return null;

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    "Usuario";

  const workshops = user.workshopMemberships ?? [];
  const dealerships = user.dealershipMemberships ?? [];
  const hasMemberships = workshops.length > 0 || dealerships.length > 0;
  const statusBadge = accountStatusBadge(user.status);
  const phoneDisplay = formatAccountPhone(user);
  const pairError =
    errors.phoneNationalNumber?.message ?? errors.phoneAreaCode?.message;

  const identityRow = (
    <div className="flex items-center gap-3">
      <ProfileAvatar user={user} />
      <div className="min-w-0">
        <p className="truncate text-base font-semibold">{fullName}</p>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
      </div>
    </div>
  );

  const membershipsSection = hasMemberships && (
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
  );

  // ── Modo lectura ───────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <Card className="w-full max-w-lg">
        <CardHeader>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <UserRound className="h-4 w-4" aria-hidden="true" />
            Datos personales
          </h2>
          <CardAction>
            <Button
              ref={editButtonRef}
              type="button"
              variant="outline"
              size="sm"
              onClick={enterEdit}
              aria-label="Editar datos personales"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Editar
            </Button>
          </CardAction>
          <CardDescription>Información de tu cuenta.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {feedback?.kind === "success" && (
            <Callout variant="success" role="status" icon={CheckCircle2}>
              {feedback.text}
            </Callout>
          )}
          {identityRow}

          {/* Campos en grilla 2 columnas (1 en mobile) */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Alias">
              {user.alias ? (
                <span className="break-all">@{user.alias}</span>
              ) : (
                <span className="text-muted-foreground">Sin alias</span>
              )}
            </Field>
            <Field label="Celular">
              {phoneDisplay ? (
                <span>{phoneDisplay}</span>
              ) : (
                <span className="text-muted-foreground">Sin celular</span>
              )}
            </Field>
            <Field label="Estado de la cuenta">
              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
            </Field>
          </div>

          {membershipsSection}
        </CardContent>
      </Card>
    );
  }

  // ── Modo edición (inline, patrón AliasCard) ───────────────────────────────
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UserRound className="h-4 w-4" aria-hidden="true" />
          Datos personales
        </h2>
        <CardDescription>Actualizá tu nombre y tu celular.</CardDescription>
      </CardHeader>
      <form
        onSubmit={handleSubmit(onSubmit)}
        onKeyDown={onFormKeyDown}
        aria-busy={isSubmitting}
      >
        <CardContent className="grid gap-5 mb-4">
          {feedback && (
            <Callout
              variant={feedback.kind === "success" ? "success" : "destructive"}
              role={feedback.kind === "success" ? "status" : "alert"}
              icon={feedback.kind === "success" ? CheckCircle2 : AlertCircle}
            >
              {feedback.text}
            </Callout>
          )}

          {/* Fila identidad read-only — intacta en modo edición */}
          {identityRow}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="personal-first-name">Nombre</Label>
              <Input
                id="personal-first-name"
                type="text"
                placeholder="Tu nombre"
                autoComplete="given-name"
                minLength={2}
                disabled={isSubmitting}
                aria-invalid={!!errors.firstName}
                aria-describedby={
                  errors.firstName ? "personal-first-name-error" : undefined
                }
                {...firstNameRegistration}
                ref={(element) => {
                  firstNameRegistration.ref(element);
                  firstNameRef.current = element;
                }}
              />
              {errors.firstName && (
                <p
                  id="personal-first-name-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="personal-last-name">Apellido</Label>
              <Input
                id="personal-last-name"
                type="text"
                placeholder="Tu apellido"
                autoComplete="family-name"
                minLength={2}
                disabled={isSubmitting}
                aria-invalid={!!errors.lastName}
                aria-describedby={
                  errors.lastName ? "personal-last-name-error" : undefined
                }
                {...register("lastName")}
              />
              {errors.lastName && (
                <p
                  id="personal-last-name-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          {/* Celular — par área/número, país fijo +54 (D-173) */}
          <fieldset className="grid gap-2 rounded-control border border-border/60 p-4">
            <legend className="mb-1 flex items-center gap-1.5 px-1 text-sm font-semibold text-foreground">
              <Smartphone
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              Celular
            </legend>
            <p className="text-xs text-muted-foreground">
              País fijo: +54 (Argentina). Dejá los dos campos vacíos para quitar
              tu celular.
            </p>
            <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
              <div className="grid gap-2">
                <Label htmlFor="personal-phone-area">Código de área</Label>
                <Input
                  id="personal-phone-area"
                  inputMode="numeric"
                  placeholder="341"
                  maxLength={6}
                  autoComplete="tel-area-code"
                  disabled={isSubmitting}
                  aria-invalid={!!pairError}
                  aria-describedby={
                    pairError ? "personal-phone-pair-error" : undefined
                  }
                  {...register("phoneAreaCode")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="personal-phone-number">Número</Label>
                <Input
                  id="personal-phone-number"
                  inputMode="numeric"
                  placeholder="3750611"
                  maxLength={12}
                  autoComplete="tel-national"
                  disabled={isSubmitting}
                  aria-invalid={!!pairError}
                  aria-describedby={
                    pairError ? "personal-phone-pair-error" : undefined
                  }
                  {...register("phoneNationalNumber")}
                />
              </div>
            </div>
            {pairError && (
              <p
                id="personal-phone-pair-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {pairError}
              </p>
            )}
          </fieldset>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none"
            disabled={isSubmitting}
            onClick={handleCancel}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className="flex-1 sm:flex-none"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Guardando...
              </>
            ) : (
              "Guardar"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
