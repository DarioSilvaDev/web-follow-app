"use client";

/**
 * Página pública de reclamo — /reclamo/[token] (F-1, copy spec §1).
 *
 * Orquestador del wizard de 3 pasos:
 *
 *   bootstrap GET /vehicle-claims/public/:token (§1.2)
 *   ├─ terminal (claimed/claim_blocked/expired/revoked) → §1.11
 *   ├─ manual_review → §1.10
 *   ├─ verified + ticket en memoria → paso cuenta (§1.8) → auto-commit
 *   ├─ verified SIN ticket (reload) → vuelve a patente (re-verificar)
 *   └─ pending/verification_required → patente (§1.3)
 *        └─ GET challenge → factor vin (§1.4) | mileage (§1.5) | manual_review
 *             └─ POST verify → ticket 20 min en memoria → cuenta (§1.8)
 *                  └─ POST commit → §1.9 éxito | §1.10 revisión
 *
 * Decisiones clave (documentadas en el reporte de la tarea):
 * - El ticket vive en un Map de módulo (vehicle-claim-ticket.ts), NO en
 *   storage: login/registro navegan con `router.push` para conservarlo; un
 *   hard reload pierde el ticket y el bootstrap `verified` vuelve a patente.
 * - `?next=/reclamo/<token>` está en el allowlist de auth-redirect (§1.8).
 * - AUTH_REQUIRED del commit → refresh best-effort + variante login §1.8
 *   (sin redirect loop). Cualquier 401 que no sea TICKET_EXPIRED cuenta.
 * - 409 "ya no está disponible" en el commit → pantalla `claimed`
 *   (simplificación — el link ya no sirve; flag en el reporte).
 * - network/5xx en el commit → genérico §1.11 con Reintentar (re-arranca el
 *   bootstrap; el ticket se conserva si sigue vigente).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ClaimError } from "@/components/vehicle-claim/claim-error";
import { ClaimLayout } from "@/components/vehicle-claim/claim-layout";
import { ClaimManualReview } from "@/components/vehicle-claim/claim-manual-review";
import { ClaimStepAccount } from "@/components/vehicle-claim/claim-step-account";
import { ClaimStepFactor } from "@/components/vehicle-claim/claim-step-factor";
import { ClaimStepPlate } from "@/components/vehicle-claim/claim-step-plate";
import { ClaimSuccess } from "@/components/vehicle-claim/claim-success";
import { ClaimWizard } from "@/components/vehicle-claim/claim-wizard";
import { useAuth } from "@/hooks/use-auth";
import { vehicleClaimApi } from "@/lib/api";
import {
  claimPublicErrorKind,
  resolveClaimVerifyErrorMessage,
  type ClaimTerminalKind,
} from "@/lib/vehicle-claim-errors";
import {
  clearClaimTicket,
  decodeClaimTicketVehicleId,
  getClaimTicket,
  saveClaimTicket,
} from "@/lib/vehicle-claim-ticket";
import type {
  ClaimChallenge,
  PublicClaimBootstrap,
} from "@/types/vehicle-claim";

type Phase =
  | "bootstrap"
  | "plate"
  | "factor"
  | "account"
  | "committing"
  | "success"
  | "manual_review"
  | "terminal";

export default function ReclamoPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { status: authStatus, refreshSession } = useAuth();

  const [phase, setPhase] = useState<Phase>("bootstrap");
  const [terminalKind, setTerminalKind] =
    useState<ClaimTerminalKind>("generic");
  const [challenge, setChallenge] = useState<ClaimChallenge | null>(null);
  const [licensePlate, setLicensePlate] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [showAviso, setShowAviso] = useState(false);
  const [pending, setPending] = useState<"challenge" | "verify" | null>(null);
  const [success, setSuccess] = useState<{
    plate: string;
    vehicleId: string | null;
  } | null>(null);

  /** Evita re-decidir el auto-commit mientras la fase sigue en cuenta. */
  const autoCommitRef = useRef(false);
  /** Blindaje StrictMode: un solo POST commit por entrada en "committing". */
  const commitStartedRef = useRef(false);
  const avisoTimerRef = useRef<number | null>(null);

  const setTerminal = useCallback((kind: ClaimTerminalKind) => {
    setTerminalKind(kind);
    setPhase("terminal");
  }, []);

  /** §4: bootstrap sólo clasifica 404/429; el resto (red/5xx) → genérico. */
  const applyBootstrap = useCallback(
    (data: PublicClaimBootstrap) => {
      const { status } = data;
      if (status === "claimed") return setTerminal("claimed");
      if (status === "claim_blocked") return setTerminal("claim_blocked");
      if (status === "expired") return setTerminal("expired");
      if (status === "revoked") return setTerminal("revoked");
      if (status === "manual_review") return setPhase("manual_review");
      if (status === "verified") {
        const record = getClaimTicket(token);
        if (record) {
          setLicensePlate(record.licensePlate);
          setAuthRequired(false);
          setPhase("account");
          return;
        }
        // Ticket perdido (hard reload) → re-verificar (fallback documentado).
        setPhase("plate");
        return;
      }
      // pending / verification_required (o estado desconocido defensivo).
      setPhase("plate");
    },
    [token, setTerminal],
  );

  /**
   * Fetch del bootstrap SIN setState síncrono: es lo que corre en el effect
   * de montaje (la regla `react-hooks/set-state-in-effect` prohíbe setState
   * directo en el cuerpo del effect; acá el primer setState ocurre después
   * del `await`).
   */
  const fetchBootstrap = useCallback(async () => {
    try {
      const data = await vehicleClaimApi.getPublicClaim(token);
      applyBootstrap(data);
    } catch (err) {
      const kind = claimPublicErrorKind(err);
      if (kind === "invalid") setTerminal("invalid");
      else if (kind === "rate_limited") setTerminal("rate_limited");
      else setTerminal("generic");
    }
  }, [token, applyBootstrap, setTerminal]);

  /** Resetea el wizard y re-busca el bootstrap (sólo desde handlers). */
  const runBootstrap = useCallback(() => {
    setPhase("bootstrap");
    setInlineError(null);
    setChallenge(null);
    return fetchBootstrap();
  }, [fetchBootstrap]);

  // Bootstrap inicial. El guard con ref (patrón invitations/[token]) evita
  // el doble fetch de StrictMode y de remounts con la misma instancia.
  const bootstrapStartedRef = useRef(false);
  useEffect(() => {
    if (bootstrapStartedRef.current) return;
    bootstrapStartedRef.current = true;
    void fetchBootstrap();
  }, [fetchBootstrap]);

  // Limpieza del aviso de redirect a registro.
  useEffect(
    () => () => {
      if (avisoTimerRef.current) window.clearTimeout(avisoTimerRef.current);
    },
    [],
  );

  // Auto-commit: con sesión activa en el paso cuenta se commitea solo.
  // `authRequired` habilita una ÚNICA re-decisión tras volver del login
  // (evita el loop AUTH_REQUIRED → commit → AUTH_REQUIRED).
  useEffect(() => {
    if (phase !== "account" || authStatus !== "authenticated") return;
    if (autoCommitRef.current && !authRequired) return;
    autoCommitRef.current = true;
    setAuthRequired(false);
    commitStartedRef.current = false;
    setPhase("committing");
  }, [phase, authStatus, authRequired]);

  // Ejecuta el POST commit una sola vez por entrada en "committing".
  useEffect(() => {
    if (phase !== "committing") return;
    if (commitStartedRef.current) return;
    commitStartedRef.current = true;
    void (async () => {
      // El chequeo del ticket vive dentro del async IIFE: en el flujo normal
      // SIEMPRE existe (sólo handleTerminalRetry lo borra y ahí la fase ya
      // cambió); es un fallback defensivo, no un path esperado.
      const record = getClaimTicket(token);
      if (!record) {
        setPhase("plate");
        return;
      }
      try {
        const result = await vehicleClaimApi.commitClaim(token, record.ticket);
        if (result.status === "claimed") {
          setSuccess({
            plate: record.licensePlate,
            vehicleId: decodeClaimTicketVehicleId(record.ticket),
          });
          setPhase("success");
        } else {
          setPhase("manual_review");
        }
      } catch (err) {
        const kind = claimPublicErrorKind(err);
        switch (kind) {
          case "auth_required":
            // Best-effort refresh + variante login §1.8 (sin redirect loop).
            void refreshSession();
            setAuthRequired(true);
            setPhase("account");
            break;
          case "ticket_expired":
            setTerminal("ticket_expired");
            break;
          case "unavailable":
            // Simplificación (flag): commit 409 "ya no está disponible" →
            // el link dejó de servir = reclamado/no disponible.
            setTerminal("claimed");
            break;
          case "claim_blocked":
            setTerminal("claim_blocked");
            break;
          case "expired":
            setTerminal("expired");
            break;
          case "revoked":
            setTerminal("revoked");
            break;
          case "locked":
            setTerminal("locked");
            break;
          case "rate_limited":
            setTerminal("rate_limited");
            break;
          case "invalid":
            setTerminal("invalid");
            break;
          default:
            // network / 5xx / desconocido → genérico con Reintentar.
            setTerminal("generic");
            break;
        }
      }
    })();
  }, [phase, token, refreshSession, setTerminal]);

  /** Errores de challenge/verify (§1.3 inline / §1.7 / §1.11 / re-bootstrap). */
  const handleFlowError = useCallback(
    (err: unknown) => {
      const kind = claimPublicErrorKind(err);
      switch (kind) {
        case "format":
        case "verify_failed":
        case "network":
          setInlineError(resolveClaimVerifyErrorMessage(err));
          break;
        case "unavailable":
          // Link ya consumido (claimed) → re-clasificar vía bootstrap.
          void runBootstrap();
          break;
        case "invalid":
          setTerminal("invalid");
          break;
        case "expired":
          setTerminal("expired");
          break;
        case "revoked":
          setTerminal("revoked");
          break;
        case "claim_blocked":
          setTerminal("claim_blocked");
          break;
        case "locked":
          setTerminal("locked");
          break;
        case "rate_limited":
          setTerminal("rate_limited");
          break;
        case "ticket_expired":
          setTerminal("ticket_expired");
          break;
        default:
          setTerminal("generic");
          break;
      }
    },
    [runBootstrap, setTerminal],
  );

  const performVerify = useCallback(
    async (input: {
      licensePlate: string;
      vinLast4?: string;
      mileageRangeId?: string;
    }) => {
      setInlineError(null);
      setPending("verify");
      try {
        const result = await vehicleClaimApi.verifyClaim(token, input);
        saveClaimTicket(token, {
          ticket: result.ticket,
          licensePlate: input.licensePlate,
        });
        autoCommitRef.current = false;
        commitStartedRef.current = false;
        setAuthRequired(false);
        setPhase("account");
      } catch (err) {
        handleFlowError(err);
      } finally {
        setPending(null);
      }
    },
    [token, handleFlowError],
  );

  const handlePlateSubmit = useCallback(
    async (plate: string) => {
      setInlineError(null);
      setPending("challenge");
      try {
        const next = await vehicleClaimApi.getClaimChallenge(token, plate);
        setLicensePlate(plate);
        if (next.factor === "manual_review") {
          // Sin VIN ni odómetro → verify directo con la patente (el backend
          // decide el factor): mismo flujo de loading, sin pantalla nueva.
          await performVerify({ licensePlate: plate });
          return;
        }
        setChallenge(next);
        setPhase("factor");
      } catch (err) {
        handleFlowError(err);
      } finally {
        setPending(null);
      }
    },
    [token, handleFlowError, performVerify],
  );

  const handleTerminalRetry = useCallback(() => {
    if (terminalKind === "ticket_expired") clearClaimTicket(token);
    autoCommitRef.current = false;
    commitStartedRef.current = false;
    setAuthRequired(false);
    setSuccess(null);
    void runBootstrap();
  }, [terminalKind, token, runBootstrap]);

  const handleRegister = useCallback(() => {
    setShowAviso(true);
    avisoTimerRef.current = window.setTimeout(() => {
      router.push(`/register?next=${encodeURIComponent(`/reclamo/${token}`)}`);
    }, 1000);
  }, [router, token]);

  const handleLogin = useCallback(() => {
    router.push(`/login?next=${encodeURIComponent(`/reclamo/${token}`)}`);
  }, [router, token]);

  // ── Render por fase ──
  const accountMode = authRequired ? "login" : "register";

  if (phase === "bootstrap") {
    return (
      <ClaimLayout>
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-14 text-center"
        >
          <Loader2
            className="h-6 w-6 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <div className="grid gap-1">
            <p className="text-base font-semibold">Abriendo tu reclamo…</p>
            <p className="text-sm text-muted-foreground">
              Estamos verificando el link que te envió el taller.
            </p>
          </div>
        </div>
      </ClaimLayout>
    );
  }

  if (phase === "terminal") {
    return (
      <ClaimLayout>
        <ClaimError kind={terminalKind} onRetry={handleTerminalRetry} />
      </ClaimLayout>
    );
  }

  if (phase === "plate") {
    return (
      <ClaimLayout>
        <ClaimStepPlate
          error={inlineError}
          loading={pending === "challenge"}
          onClearError={() => setInlineError(null)}
          onSubmit={(plate) => void handlePlateSubmit(plate)}
        />
      </ClaimLayout>
    );
  }

  if (phase === "factor" && challenge) {
    const isVin = challenge.factor === "vin";
    return (
      <ClaimLayout>
        <ClaimWizard
          currentStep={1}
          title={
            isVin
              ? "Verificá el vehículo"
              : "¿Cuántos kilómetros tenía el vehículo?"
          }
          description={
            isVin
              ? "Necesitamos un dato que sólo figure en tus documentos."
              : "Elegí el rango que más se acerque al kilometraje que figuraba cuando lo llevaste al taller."
          }
        >
          <ClaimStepFactor
            challenge={challenge}
            error={inlineError}
            loading={pending === "verify"}
            onClearError={() => setInlineError(null)}
            onVerify={(input) =>
              void performVerify({ licensePlate, ...input })
            }
            onBack={() => {
              setInlineError(null);
              setChallenge(null);
              setPhase("plate");
            }}
          />
        </ClaimWizard>
      </ClaimLayout>
    );
  }

  if (phase === "account") {
    return (
      <ClaimLayout>
        <ClaimWizard
          currentStep={2}
          accountMode={accountMode}
          title={authRequired ? "Iniciá sesión" : "Creá tu cuenta"}
          description={
            authRequired
              ? "Ya verificamos el vehículo. Ingresá para reclamar el historial."
              : "Verificamos que el vehículo es tuyo. Creá tu cuenta para reclamar el historial."
          }
        >
          <ClaimStepAccount
            mode={accountMode}
            showAviso={showAviso}
            onRegister={handleRegister}
            onLogin={handleLogin}
          />
        </ClaimWizard>
      </ClaimLayout>
    );
  }

  if (phase === "committing") {
    return (
      <ClaimLayout>
        <ClaimWizard
          currentStep={2}
          accountMode={accountMode}
          title="Reclamando…"
        >
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="flex justify-center py-6"
          >
            <Loader2
              className="h-6 w-6 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">Reclamando…</span>
          </div>
        </ClaimWizard>
      </ClaimLayout>
    );
  }

  if (phase === "success") {
    return (
      <ClaimLayout>
        <ClaimWizard
          currentStep={3}
          title="¡Vehículo reclamado!"
        >
          <ClaimSuccess
            licensePlate={success?.plate ?? licensePlate}
            vehicleId={success?.vehicleId ?? null}
          />
        </ClaimWizard>
      </ClaimLayout>
    );
  }

  // phase === "manual_review"
  return (
    <ClaimLayout>
      <ClaimWizard currentStep={3} title="Tu reclamo está en revisión">
        <ClaimManualReview />
      </ClaimWizard>
    </ClaimLayout>
  );
}
