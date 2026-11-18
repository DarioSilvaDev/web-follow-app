"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, ArrowLeft, Loader2, CheckCircle2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { authApi } from "@/lib/api";
import { isSafeNextPath } from "@/lib/auth-redirect";

const registerSchema = z
  .object({
    firstName: z
      .string()
      .min(2, "El nombre debe tener al menos 2 caracteres"),
    lastName: z
      .string()
      .min(2, "El apellido debe tener al menos 2 caracteres"),
    phoneAreaCode: z
      .string()
      .trim()
      .max(6, "El código de área es demasiado largo"),
    phoneNationalNumber: z
      .string()
      .trim()
      .max(12, "El número es demasiado largo"),
    email: z.string().email("Ingresa un email válido"),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string(),
  })
  .superRefine((values, ctx) => {
    // D-173: celular OBLIGATORIO — par área/número, país fijo +54.
    const areaDigits = values.phoneAreaCode.replace(/\D/g, "");
    const numberDigits = values.phoneNationalNumber.replace(/\D/g, "");
    if (areaDigits === "" || numberDigits === "") {
      ctx.addIssue({
        code: "custom",
        path: ["phoneNationalNumber"],
        message: "Ingresá el código de área y el número.",
      });
    } else if (areaDigits.length < 2 || numberDigits.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["phoneNationalNumber"],
        message: "Ingresá un celular válido (código de área y número).",
      });
    }
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

function RegisterFormInner() {
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // D-12 §8: preserve the allowlisted deep link across the login the user does
  // right after registering (QR round-trip).
  const rawNext = searchParams.get("next");
  const safeNext = isSafeNextPath(rawNext) ? rawNext : null;
  const loginHref = safeNext
    ? `/login?next=${encodeURIComponent(safeNext)}`
    : "/login";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setServerError(null);
    try {
      await authApi.register({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
        phone: {
          areaCode: data.phoneAreaCode.replace(/\D/g, ""),
          nationalNumber: data.phoneNationalNumber.replace(/\D/g, ""),
        },
      });
      setSuccess(true);
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string; code?: string };
      if (error.status === 400) {
        setServerError(error.message || "Datos inválidos. Revisá el formulario.");
      } else if (error.status === 409) {
        setServerError(
          error.message || "Ya existe una cuenta con este email.",
        );
      } else if (error.status === 429) {
        setServerError("Demasiados intentos. Intenta más tarde.");
      } else if (error.status && error.status >= 500) {
        setServerError("Error interno del servidor. Intenta más tarde.");
      } else {
        setServerError(error.message || "Error al crear la cuenta.");
      }
    }
  };

  if (success) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-semibold">
            Cuenta creada
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pb-6">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
          <p className="text-center text-sm text-muted-foreground">
            Revisa tu email para verificar la cuenta. El enlace de verificación
            expira en 24 horas.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Link href={loginHref}>
            <Button variant="outline">Ir al inicio de sesión</Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl font-semibold">
          Crear cuenta
        </CardTitle>
        <CardDescription>
          Completa los datos para registrarte en Autentia.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="firstName">Nombre</Label>
              <Input
                id="firstName"
                type="text"
                placeholder="Tu nombre"
                autoComplete="given-name"
                aria-invalid={!!errors.firstName}
                {...register("firstName")}
              />
              {errors.firstName && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastName">Apellido</Label>
              <Input
                id="lastName"
                type="text"
                placeholder="Tu apellido"
                autoComplete="family-name"
                aria-invalid={!!errors.lastName}
                {...register("lastName")}
              />
              {errors.lastName && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          {/* Celular OBLIGATORIO — par área/número, país fijo +54 (D-173) */}
          <fieldset className="grid gap-2 rounded-control border border-border/60 p-4">
            <legend className="mb-1 flex items-center gap-1.5 px-1 text-sm font-semibold text-foreground">
              <Smartphone
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              Celular
            </legend>
            <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
              <div className="grid gap-2">
                <Label htmlFor="register-phone-area">Código de área</Label>
                <Input
                  id="register-phone-area"
                  inputMode="numeric"
                  placeholder="341"
                  maxLength={6}
                  autoComplete="tel-area-code"
                  aria-invalid={
                    !!(errors.phoneNationalNumber ?? errors.phoneAreaCode)
                  }
                  aria-describedby={
                    errors.phoneNationalNumber ?? errors.phoneAreaCode
                      ? "register-phone-pair-error"
                      : undefined
                  }
                  {...register("phoneAreaCode")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="register-phone-number">Número</Label>
                <Input
                  id="register-phone-number"
                  inputMode="numeric"
                  placeholder="3750611"
                  maxLength={12}
                  autoComplete="tel-national"
                  aria-invalid={
                    !!(errors.phoneNationalNumber ?? errors.phoneAreaCode)
                  }
                  aria-describedby={
                    errors.phoneNationalNumber ?? errors.phoneAreaCode
                      ? "register-phone-pair-error"
                      : undefined
                  }
                  {...register("phoneNationalNumber")}
                />
              </div>
            </div>
            {(errors.phoneNationalNumber ?? errors.phoneAreaCode) && (
              <p
                id="register-phone-pair-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.phoneNationalNumber?.message ??
                  errors.phoneAreaCode?.message}
              </p>
            )}
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                autoComplete="email"
                className="pl-10"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
            </div>
            {errors.email && (
              <p className="text-sm text-destructive" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>

          <PasswordInput
            id="password"
            label="Contraseña"
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            error={errors.password?.message}
            register={register("password")}
          />

          <PasswordInput
            id="confirmPassword"
            label="Confirmar contraseña"
            placeholder="Repite tu contraseña"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            register={register("confirmPassword")}
          />

          {serverError && (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creando cuenta...
              </>
            ) : (
              "Crear cuenta"
            )}
          </Button>
          <Link
            href={loginHref}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" />
            Ya tenés una cuenta? Iniciá sesión
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      }
    >
      <RegisterFormInner />
    </Suspense>
  );
}
