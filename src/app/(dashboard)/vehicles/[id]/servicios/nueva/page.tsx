"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Eye,
  ImagePlus,
  List,
  Loader2,
  PenLine,
  RotateCw,
  Search,
  Store,
  Trash2,
} from "lucide-react";
import {
  FormSection,
  FormSectionAccordion,
  type SectionStatus,
} from "@/components/forms/form-section";
import { BottomSheet, BottomSheetContent } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActiveContext } from "@/hooks/use-active-context";
import { useDebounce } from "@/hooks/use-debounce";
import { careEpisodeApi, workshopApi } from "@/lib/api";
import {
  ATTACHMENT_VALIDATION_MESSAGES,
  validateAttachmentFiles,
} from "@/lib/attachment-validation";
import { CARE_EPISODE_ATTACHMENT_LIMITS } from "@/types/care-episode";
import type { WorkshopSearchResult } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Iteración 2-2 / RF-8 — "Registrar servicio" (propietario, contexto PERSONAL).
// Journey: formulario del servicio histórico → taller responsable (búsqueda en
// la app con debounce **o** texto libre "Otro taller", XOR D-066) →
// POST /api/care-episodes/owner (spec 2-2 §5, RF-1).
//
// Iteración 3 (UX "Taller responsable", imagen 3 + listado completo en bottom
// sheet): buscador único compartido (inline + sugerencias + bottom sheet),
// catálogo paginado `GET /workshops/catalog` para el listado completo y las
// sugerencias, diferenciación "registrado en Autentia" vs "taller libre".
//
// WORKSHOP-only al revés: si hay un taller seleccionado, el backend responde
// 403 (el handler exige ctx.type === 'PERSONAL'); la página orienta a volver a
// "Personal" (mismo patrón de orientación que /atenciones/nueva).
// ---------------------------------------------------------------------------

const RATE_LIMIT_MESSAGE =
  "Demasiadas solicitudes. Esperá unos segundos e intentá de nuevo.";

/** Fecha local `YYYY-MM-DD` (el input type=date trabaja en hora local). */
function todayISOLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Comparación lexicográfica válida para fechas ISO `YYYY-MM-DD`. */
function isFutureDate(value: string): boolean {
  return value > todayISOLocal();
}

const ownerServiceSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "El título es obligatorio")
    .max(120, "El título no puede superar los 120 caracteres"),
  serviceDate: z
    .string()
    .min(1, "La fecha del servicio es obligatoria")
    .refine((value) => !isFutureDate(value), "La fecha no puede ser futura"),
  mileageIn: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d+$/.test(value),
      "El kilometraje debe ser un número entero",
    )
    .refine(
      (value) => value === "" || Number(value) >= 0,
      "El kilometraje debe ser mayor o igual a 0",
    )
    .optional(),
  notes: z
    .string()
    .trim()
    .max(1000, "Las notas no pueden superar los 1000 caracteres")
    .optional(),
  workshopName: z
    .string()
    .trim()
    .max(150, "El nombre del taller no puede superar los 150 caracteres")
    .optional(),
});

type OwnerServiceFormValues = z.infer<typeof ownerServiceSchema>;

type WorkshopMode = "search" | "other";

export default function OwnerServiceFormPage() {
  const { id: vehicleId } = useParams<{ id: string }>();
  const activeContext = useActiveContext();

  // El journey del propietario es PERSONAL-only (RF-1): con un taller
  // seleccionado el POST /care-episodes/owner respondería 403.
  if (activeContext?.type === "WORKSHOP") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <Heading vehicleId={vehicleId} />
        <Card>
          <CardContent>
            <p role="status" className="text-sm text-muted-foreground">
              Para registrar un servicio como propietario necesitás operar en
              tu contexto personal. Limpiá el contexto activo con la ✕ del chip
              del header e intentá nuevamente.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <OwnerServiceForm vehicleId={vehicleId} />;
}

function OwnerServiceForm({ vehicleId }: { vehicleId: string }) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OwnerServiceFormValues>({
    resolver: zodResolver(ownerServiceSchema),
  });

  // ── Taller responsable (XOR D-066) ────────────────────────────────────────
  const [workshopMode, setWorkshopMode] = useState<WorkshopMode>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 400);
  const [selectedWorkshop, setSelectedWorkshop] =
    useState<WorkshopSearchResult | null>(null);
  const [workshopError, setWorkshopError] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const trimmedQuery = debouncedQuery.trim();

  const searchQueryResult = useQuery({
    queryKey: ["workshops-search", trimmedQuery],
    queryFn: () => workshopApi.searchWorkshops(trimmedQuery),
    enabled:
      workshopMode === "search" &&
      selectedWorkshop === null &&
      trimmedQuery.length >= 2,
    retry: false,
  });

  // Sugerencias (búsqueda vacía): primeros talleres activos del catálogo
  // (orden alfabético), sin depender de que el usuario escriba.
  const suggestionsQuery = useQuery({
    queryKey: ["workshops-catalog", "suggestions"],
    queryFn: () => workshopApi.listCatalog({ page: 1, limit: 4 }),
    enabled: workshopMode === "search" && selectedWorkshop === null,
    retry: false,
    staleTime: 60_000,
  });

  const selectResult = (result: WorkshopSearchResult) => {
    setSelectedWorkshop(result);
    setSearchQuery("");
    setWorkshopError(null);
  };

  const clearSelection = () => {
    setSelectedWorkshop(null);
    setWorkshopError(null);
  };

  const switchMode = (mode: WorkshopMode) => {
    setWorkshopMode(mode);
    setWorkshopError(null);
    clearSelection();
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdWorkshopLabel, setCreatedWorkshopLabel] = useState<
    string | null
  >(null);
  const [retry, setRetry] = useState<{
    data: OwnerServiceFormValues;
    workshopId?: string;
    workshopName?: string;
  } | null>(null);

  // ── Evidencia opcional (S6, iteración 2-4) ────────────────────────────────
  // Multipart EN LA CREACIÓN (POST /care-episodes/owner con files): es una
  // transacción única (episodio + adjuntos), el camino preferido por el
  // contrato. Sin files → path JSON histórico intacto.
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  // Subida indeterminada (sin % real): el multipart viaja buffered y el cliente
  // no puede reportar progreso sin forzar streaming y romper HTTP/1.1 (api.ts).
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [createdServiceId, setCreatedServiceId] = useState<string | null>(null);

  const handleEvidenceFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const node = event.target;
    // Materializar el FileList ANTES de limpiar `value`: el FileList es vivo
    // y limpiar el input vacía la selección (en navegadores reales).
    const files = node.files;
    const batch = files ? Array.from(files) : [];
    node.value = "";
    if (batch.length === 0) return;
    // El límite de lote del owner create (FilesInterceptor MAX 5) es por
    // servicio, no por selección → validar contra lo ya acumulado.
    if (
      evidenceFiles.length + batch.length >
      CARE_EPISODE_ATTACHMENT_LIMITS.maxBatch
    ) {
      setEvidenceError(ATTACHMENT_VALIDATION_MESSAGES.batch);
      return;
    }
    const result = validateAttachmentFiles(batch, 0);
    if (!result.ok) {
      setEvidenceError(result.message);
      return;
    }
    setEvidenceError(null);
    setEvidenceFiles((prev) => [...prev, ...result.files]);
  };

  const removeEvidenceFile = (index: number) => {
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Modal de confirmación (D-074) ────────────────────────────────────────
  // El POST solo se dispara al confirmar el modal; "Cancelar" lo descarta y
  // el form queda editable sin llamada de red.
  const [confirmPending, setConfirmPending] = useState<{
    data: OwnerServiceFormValues;
    workshopId?: string;
    workshopName?: string;
  } | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // ── Secciones del acordeón (mismo patrón que el check-in/alta) ──────────────
  // Arrancan todas cerradas.
  const [openSection, setOpenSection] = useState<string[]>([]);
  /** Abre la sección indicada y cierra las demás (una sola abierta a la vez). */
  const openSectionById = (id: string) => setOpenSection([id]);

  const watchedTitle = watch("title") ?? "";
  const watchedServiceDate = watch("serviceDate") ?? "";
  const watchedWorkshopName = watch("workshopName") ?? "";

  const servicioStatus: SectionStatus =
    watchedTitle.trim() !== "" && watchedServiceDate.trim() !== ""
      ? "complete"
      : "incomplete";
  const evidenciaStatus: SectionStatus =
    evidenceFiles.length > 0 ? "complete" : "optional";
  const tallerStatus: SectionStatus =
    (workshopMode === "search"
      ? selectedWorkshop !== null
      : watchedWorkshopName.trim() !== ""
    )
      ? "complete"
      : "incomplete";

  const onInvalid = (formErrors: typeof errors) => {
    const firstField = Object.keys(formErrors)[0];
    openSectionById(firstField === "workshopName" ? "taller" : "servicio");
  };

  const mapSubmitError = (error: unknown): string | null => {
    const apiError = error as { status?: number; message?: string };
    if (apiError.status === 400) {
      return (
        "Revisá los datos: la fecha no puede ser futura y solo podés indicar " +
        "un taller (seleccionado de la app o por texto libre, no ambos)."
      );
    }
    if (apiError.status === 404) {
      return "El vehículo o el taller seleccionado ya no está disponible.";
    }
    if (apiError.status === 403) {
      return (
        "No tenés permisos para registrar servicios de este vehículo: " +
        "debe ser el propietario."
      );
    }
    if (apiError.status === 429) {
      return RATE_LIMIT_MESSAGE;
    }
    if (apiError.status && apiError.status >= 500) {
      return "Error interno del servidor. Intentalo nuevamente.";
    }
    return (
      apiError.message || "No se pudo registrar el servicio. Intentalo nuevamente."
    );
  };

  const submitOwnerService = async (
    data: OwnerServiceFormValues,
    workshop: { workshopId?: string; workshopName?: string },
  ) => {
    setSubmitError(null);
    setWorkshopError(null);
    // Con archivos, la creación viaja como multipart: mostramos un estado
    // indeterminado mientras dura el POST (sin % real, ver api.ts).
    setEvidenceUploading(evidenceFiles.length > 0);
    try {
      const commonInput = {
        vehicleId,
        title: data.title,
        serviceDate: data.serviceDate,
        ...(workshop.workshopId ? { workshopId: workshop.workshopId } : {}),
        ...(workshop.workshopName ? { workshopName: workshop.workshopName } : {}),
        mileageIn: data.mileageIn ? Number(data.mileageIn) : undefined,
        notes: data.notes || undefined,
      };

      // S6: con archivos → multipart transaccional (episodio + evidencia).
      // Sin archivos → path JSON histórico idéntico al de la iteración 2-2.
      let createdId: string;
      if (evidenceFiles.length > 0) {
        const created = await careEpisodeApi.createOwnerCareEpisodeWithFiles(
          commonInput,
          evidenceFiles,
          undefined,
        );
        createdId = created.id;
      } else {
        const created = await careEpisodeApi.createOwnerCareEpisode(commonInput);
        createdId = created.id;
      }

      setCreatedServiceId(createdId);
      setCreatedWorkshopLabel(
        workshop.workshopName ||
          selectedWorkshop?.name ||
          "el taller seleccionado",
      );
      setRetry(null);
    } catch (error) {
      const message = mapSubmitError(error);
      setSubmitError(message);
      if ((error as { status?: number }).status === 429) {
        setRetry({ data, ...workshop });
      } else {
        setRetry(null);
      }
    } finally {
      setEvidenceUploading(false);
    }
  };

  const onSubmit = (data: OwnerServiceFormValues) => {
    let workshopId: string | undefined;
    let workshopName: string | undefined;

    if (workshopMode === "search") {
      if (!selectedWorkshop) {
        setWorkshopError(
          "Buscá y seleccioná un taller, o elegí la opción \"Otro taller\".",
        );
        openSectionById("taller");
        return;
      }
      workshopId = selectedWorkshop.id;
    } else {
      const name = data.workshopName?.trim();
      if (!name) {
        setWorkshopError(
          "Ingresá el nombre del taller, o buscá un taller en la app.",
        );
        openSectionById("taller");
        return;
      }
      workshopName = name;
    }

    // XOR defensivo (D-066): nunca enviar ambos campos.
    if (workshopId && workshopName) {
      setWorkshopError(
        "Indicá un solo taller: seleccionado de la app o por texto libre.",
      );
      openSectionById("taller");
      return;
    }

    // D-074: antes de enviar el POST, mostrar el modal de confirmación.
    setConfirmPending({ data, workshopId, workshopName });
  };

  const handleConfirm = async () => {
    if (!confirmPending || confirmSubmitting) return;
    setConfirmSubmitting(true);
    try {
      await submitOwnerService(confirmPending.data, {
        workshopId: confirmPending.workshopId,
        workshopName: confirmPending.workshopName,
      });
    } finally {
      setConfirmSubmitting(false);
      setConfirmPending(null);
    }
  };

  const handleCancelConfirm = () => {
    if (confirmSubmitting) return;
    setConfirmPending(null);
  };

  const handleRetry = async () => {
    if (!retry) return;
    await submitOwnerService(retry.data, {
      workshopId: retry.workshopId,
      workshopName: retry.workshopName,
    });
  };

  const resetAfterSuccess = () => {
    reset();
    setCreatedWorkshopLabel(null);
    setSubmitError(null);
    setWorkshopError(null);
    clearSelection();
    setWorkshopMode("search");
    setEvidenceFiles([]);
    setEvidenceError(null);
    setEvidenceUploading(false);
    setCreatedServiceId(null);
  };

  // ── Estado de éxito ───────────────────────────────────────────────────────
  if (createdWorkshopLabel) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <Heading vehicleId={vehicleId} />
        <Card>
          <CardContent className="grid gap-3">
            <p role="status" className="text-sm font-medium text-primary">
              Servicio registrado
            </p>
            {createdServiceId && (
              <Link
                href={`/vehicles/${vehicleId}/servicios/${createdServiceId}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              >
                <Eye className="h-4 w-4" />
                Ver detalle del servicio
              </Link>
            )}
            <p className="text-sm text-muted-foreground">
              Quedará como &quot;Registrado por el propietario&quot; hasta que{" "}
              {createdWorkshopLabel} lo verifique o lo rechace.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={resetAfterSuccess} variant="outline">
              Registrar otro
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Heading vehicleId={vehicleId} />

      <form
        onSubmit={handleSubmit(onSubmit, onInvalid)}
        noValidate
        className="grid gap-4 pb-2"
      >
          <FormSectionAccordion
            value={openSection}
            onValueChange={setOpenSection}
          >
            {/* Servicio — qué se hizo y cuándo */}
            <FormSection
              value="servicio"
              title="Servicio"
              status={servicioStatus}
              description="Contá qué trabajo se hizo y en qué fecha."
            >
            <div className="grid gap-2">
              <Label htmlFor="title">Título del servicio</Label>
              <Input
                id="title"
                className="bg-card"
                placeholder="Ej. Cambio de aceite "
                maxLength={120}
                autoComplete="off"
                aria-invalid={!!errors.title}
                {...register("title")}
              />
              {errors.title && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="serviceDate">Fecha del servicio</Label>
              <Input
                id="serviceDate"
                className="bg-card"
                type="date"
                max={todayISOLocal()}
                aria-invalid={!!errors.serviceDate}
                {...register("serviceDate")}
              />
              {errors.serviceDate ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.serviceDate.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Puede ser una fecha pasada (histórico). No puede ser futura.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mileageIn">Kilometraje (opcional)</Label>
              <Input
                id="mileageIn"
                className="bg-card"
                inputMode="numeric"
                sanitize="digits"
                placeholder="Ej. 18500"
                maxLength={10}
                autoComplete="off"
                aria-invalid={!!errors.mileageIn}
                {...register("mileageIn")}
              />
              {errors.mileageIn && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.mileageIn.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                className="bg-card"
                placeholder="Ej. Aceite 5W30, dos neumáticos delanteros..."
                rows={3}
                maxLength={1000}
                aria-invalid={!!errors.notes}
                {...register("notes")}
              />
              {errors.notes ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.notes.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Máximo 1000 caracteres.
                </p>
              )}
            </div>
            </FormSection>

            {/* Evidencia opcional (S6 — multipart en la creación) */}
            <FormSection
              value="evidencia"
              title="Evidencia"
              status={evidenciaStatus}
              description="Fotos del trabajo (hasta 5: JPG, PNG, WebP o AVIF, máx. 5MB c/u). Se guardan como evidencia en el historial."
            >
            <div className="grid gap-2">

              {evidenceFiles.length > 0 ? (
                <ul className="grid gap-1.5">
                  {evidenceFiles.map((file, index) => (
                    <li
                      key={`${file.name}:${file.size}`}
                      data-testid={`evidence-file-${file.name}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-sm"
                    >
                      <span className="min-w-0 truncate">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Quitar ${file.name}`}
                        disabled={isSubmitting}
                        onClick={() => removeEvidenceFile(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {evidenceUploading && evidenceFiles.length > 0 && (
                <p
                  role="status"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Subiendo evidencia...
                </p>
              )}
              {evidenceError && (
                <p className="text-sm text-destructive" role="alert">
                  {evidenceError}
                </p>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                disabled={isSubmitting}
                onClick={() => evidenceInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                {evidenceFiles.length > 0
                  ? "Agregar más fotos"
                  : "Adjuntar fotos"}
              </Button>
              <input
                ref={evidenceInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                data-testid="owner-evidence-input"
                aria-label="Adjuntar imágenes de evidencia"
                onChange={handleEvidenceFiles}
              />
            </div>
            </FormSection>

            {/* Taller responsable (XOR D-066) */}
            <FormSection
              value="taller"
              title="Taller responsable"
              status={tallerStatus}
              description="El taller que realizó el trabajo. Si está en Autentia, podrá verificarlo."
            >

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={workshopMode === "search" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setWorkshopMode("search");
                    setWorkshopError(null);
                  }}
                >
                  <Search className="h-4 w-4" />
                  Buscar en la app
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setWorkshopMode("search");
                    setWorkshopError(null);
                    setCatalogOpen(true);
                  }}
                >
                  <List className="h-4 w-4" />
                  Seleccionar de la lista
                </Button>
              </div>

              {workshopMode === "search" && (
                <div className="grid gap-2">
                  {selectedWorkshop ? (
                    <div
                      className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-2.5"
                      data-testid="workshop-selected"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Store className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {selectedWorkshop.name}
                        </p>
                        {selectedWorkshop.city && (
                          <p className="truncate text-xs text-muted-foreground">
                            {selectedWorkshop.city}
                          </p>
                        )}
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                          <BadgeCheck className="h-3.5 w-3.5" />
                          Registrado en Autentia
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearSelection}
                      >
                        Cambiar
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Label htmlFor="workshop-search">
                        Buscar taller por nombre (mínimo 2 caracteres)
                      </Label>
                      <div className="relative">
                        <Search
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                          id="workshop-search"
                          placeholder="Buscar taller por nombre..."
                          maxLength={50}
                          autoComplete="off"
                          className="bg-card pl-9 pr-11"
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                        />
                        <button
                          type="button"
                          aria-label="Ver todos los talleres"
                          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setCatalogOpen(true)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>

                      {trimmedQuery.length < 2 ? (
                        <>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Sugerencias
                          </p>
                          {suggestionsQuery.isLoading ? (
                            <p
                              role="status"
                              className="flex items-center gap-1.5 text-xs text-muted-foreground"
                            >
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Cargando sugerencias...
                            </p>
                          ) : suggestionsQuery.isError ? (
                            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>No se pudieron cargar las sugerencias.</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void suggestionsQuery.refetch()}
                              >
                                Reintentar
                              </Button>
                            </div>
                          ) : suggestionsQuery.data &&
                            suggestionsQuery.data.data.length > 0 ? (
                            <ul className="grid gap-1">
                              {suggestionsQuery.data.data.map((result) => (
                                <li key={result.id}>
                                  <WorkshopResultButton
                                    workshop={result}
                                    onSelect={selectResult}
                                  />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Todavía no hay talleres registrados. Podés
                              registrarlo como taller libre.
                            </p>
                          )}
                        </>
                      ) : searchQueryResult.isLoading ? (
                        <p
                          role="status"
                          className="text-sm text-muted-foreground"
                        >
                          Buscando talleres...
                        </p>
                      ) : searchQueryResult.data &&
                        searchQueryResult.data.length > 0 ? (
                        <>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Resultados
                          </p>
                          <ul className="grid gap-1">
                            {searchQueryResult.data.map((result) => (
                              <li key={result.id}>
                                <WorkshopResultButton
                                  workshop={result}
                                  onSelect={selectResult}
                                />
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : searchQueryResult.isError ? (
                        <SearchErrorPanel
                          status={
                            (searchQueryResult.error as { status?: number })
                              .status
                          }
                          onRetry={() => void searchQueryResult.refetch()}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No se encontraron talleres con ese nombre. Podés
                          elegir &quot;Otro taller&quot; y escribirlo como texto libre.
                        </p>
                      )}

                      {/* Listado completo paginado → bottom sheet */}
                      <div className="border-t pt-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Ver todos los talleres
                        </p>
                        <button
                          type="button"
                          onClick={() => setCatalogOpen(true)}
                          className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-primary transition-colors outline-none hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <List className="h-4 w-4" />
                          <span className="flex-1 text-left">
                            Ver listado completo
                          </span>
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex justify-center border-t pt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={() => switchMode("other")}
                        >
                          <PenLine className="h-4 w-4" />
                          ¿No está en Autentia? Usar otro taller
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {workshopMode === "other" && (
                <div className="grid gap-2 rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      <PenLine className="h-3 w-3" />
                      Taller libre
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Sin verificación posible hasta que se registre en Autentia
                    </span>
                  </div>
                  <Label htmlFor="workshopName">
                    Nombre del taller (texto libre)
                  </Label>
                  <Input
                    id="workshopName"
                    className="bg-card"
                    placeholder="Ej. Taller de la esquina"
                    maxLength={150}
                    autoComplete="off"
                    aria-invalid={!!errors.workshopName}
                    {...register("workshopName")}
                  />
                  {errors.workshopName && (
                    <p className="text-sm text-destructive" role="alert">
                      {errors.workshopName.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Es texto libre, no un taller verificable: quedará sin
                    verificación posible hasta que ese taller se registre y lo
                    reclame (fuera de alcance MVP).
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-self-start"
                    onClick={() => {
                      setWorkshopMode("search");
                      setWorkshopError(null);
                    }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Volver a buscar en la app
                  </Button>
                </div>
              )}

              {workshopError && (
                <p className="text-sm text-destructive" role="alert">
                  {workshopError}
                </p>
              )}
            </FormSection>
          </FormSectionAccordion>

            {submitError && (
              <div className="grid gap-2" role="alert">
                <p className="text-sm text-destructive">{submitError}</p>
                {retry && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRetry()}
                  >
                    Reintentar
                  </Button>
                )}
              </div>
            )}

        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Registrando...
            </>
          ) : (
            "Registrar servicio"
          )}
        </Button>
      </form>

      {/* Listado completo de talleres (bottom sheet). Vive fuera del
          <form> para no anidar botones dentro del form. */}
      {catalogOpen && (
        <WorkshopCatalogSheet
          open={catalogOpen}
          onClose={() => setCatalogOpen(false)}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          debouncedQuery={debouncedQuery}
          onSelect={(workshop) => {
            selectResult(workshop);
            setCatalogOpen(false);
          }}
          onUseFreeText={(name) => {
            clearSelection();
            setWorkshopMode("other");
            setWorkshopError(null);
            setValue("workshopName", name);
            setSearchQuery("");
            setCatalogOpen(false);
          }}
        />
      )}

      {/* D-074: modal de confirmación antes del POST /care-episodes/owner.
          Vive fuera del <form> para no anidar botones dentro del form. */}
      {confirmPending && (
        <ConfirmServiceModal
          evidenceCount={evidenceFiles.length}
          isSubmitting={confirmSubmitting}
          onCancel={handleCancelConfirm}
          onConfirm={() => void handleConfirm()}
        />
      )}
    </div>
  );
}

function Heading({ vehicleId }: { vehicleId: string }) {
  const activeContext = useActiveContext();
  // Retorno contextual (mismo criterio que el detalle de atención): en
  // contexto WORKSHOP el detalle del vehículo no es accesible (403), así que
  // "volver" lleva a la lista de atenciones; resto → detalle del vehículo.
  const isWorkshopContext = activeContext?.type === "WORKSHOP";
  const backHref = isWorkshopContext ? "/atenciones" : `/vehicles/${vehicleId}`;
  const backLabel = isWorkshopContext
    ? "Volver a atenciones"
    : "Volver al vehículo";
  return (
    <div>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {backLabel}
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">
        Registrar servicio
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Registrá un servicio histórico realizado sobre este vehículo.
      </p>
    </div>
  );
}

function SearchErrorPanel({
  status,
  onRetry,
}: {
  status?: number;
  onRetry: () => void;
}) {
  return (
    <div className="grid gap-2" role="alert">
      <p className="text-sm text-destructive">
        {status === 429
          ? RATE_LIMIT_MESSAGE
          : "No se pudo buscar talleres. Intentalo nuevamente."}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RotateCw className="h-3.5 w-3.5" />
        Reintentar
      </Button>
    </div>
  );
}

/**
 * Fila de taller registrado (ícono + nombre + ciudad + chevron).
 * Se usa igual en sugerencias, resultados de búsqueda y el bottom sheet.
 */
function WorkshopResultButton({
  workshop,
  onSelect,
}: {
  workshop: WorkshopSearchResult;
  onSelect: (workshop: WorkshopSearchResult) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(workshop)}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Store className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {workshop.name}
        </span>
        {workshop.city && (
          <span className="block truncate text-xs text-muted-foreground">
            {workshop.city}
          </span>
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/**
 * Bottom sheet con el catálogo COMPLETO de talleres registrados en Autentia.
 * Comparte el mismo estado de búsqueda del formulario (query/onQueryChange):
 * no hay un segundo buscador independiente. Listado paginado con envelope
 * `{ data, meta }` vía `useInfiniteQuery` ("Cargar más" incremental), acotado
 * a "proveer el listado" — la selección vuelve al formulario con onSelect.
 */
function WorkshopCatalogSheet({
  open,
  onClose,
  query,
  onQueryChange,
  debouncedQuery,
  onSelect,
  onUseFreeText,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  debouncedQuery: string;
  onSelect: (workshop: WorkshopSearchResult) => void;
  onUseFreeText: (name: string) => void;
}) {
  const trimmed = debouncedQuery.trim();
  const queryParam = trimmed.length >= 2 ? trimmed : undefined;

  const catalogQuery = useInfiniteQuery({
    queryKey: ["workshops-catalog", "sheet", queryParam ?? ""],
    queryFn: ({ pageParam }) =>
      workshopApi.listCatalog({ q: queryParam, page: pageParam, limit: 10 }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages
        ? lastPage.meta.page + 1
        : undefined,
    retry: false,
  });

  const workshops =
    catalogQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const total = catalogQuery.data?.pages[0]?.meta.total ?? null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <BottomSheetContent title="Talleres en Autentia" onClose={onClose}>
        {/* Buscador compartido (mismo valor que el del formulario) */}
        <div className="shrink-0 px-4 pb-2">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="workshop-catalog-search"
              aria-label="Buscar en el listado de talleres"
              placeholder="Buscar taller por nombre..."
              maxLength={50}
              autoComplete="off"
              className="pl-9"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </div>
        </div>

        <p className="shrink-0 px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {queryParam ? `Resultados para "${trimmed}"` : "Todos los talleres"}
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          {catalogQuery.isLoading ? (
            <p
              role="status"
              className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando talleres...
            </p>
          ) : catalogQuery.isError ? (
            <div
              role="alert"
              className="grid justify-items-center gap-2 py-10 text-center"
            >
              <p className="text-sm text-destructive">
                No se pudo cargar el listado de talleres.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void catalogQuery.refetch()}
              >
                <RotateCw className="h-3.5 w-3.5" />
                Reintentar
              </Button>
            </div>
          ) : workshops.length === 0 ? (
            <div className="grid justify-items-center gap-2 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No encontramos talleres{queryParam ? ` para "${trimmed}"` : ""}.
              </p>
              {queryParam && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onUseFreeText(trimmed)}
                >
                  <PenLine className="h-4 w-4" />
                  Usar &quot;{trimmed}&quot; como taller libre
                </Button>
              )}
            </div>
          ) : (
            <ul className="grid gap-0.5 pb-2">
              {workshops.map((workshop) => (
                <li key={workshop.id}>
                  <WorkshopResultButton
                    workshop={workshop}
                    onSelect={onSelect}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer: conteo + carga incremental / escape a taller libre */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2">
          <p className="text-[11px] text-muted-foreground" aria-live="polite">
            {total !== null && workshops.length > 0
              ? `Mostrando ${workshops.length} de ${total} · registrados en Autentia`
              : "Talleres registrados en Autentia"}
          </p>
          {catalogQuery.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={catalogQuery.isFetchingNextPage}
              onClick={() => void catalogQuery.fetchNextPage()}
            >
              {catalogQuery.isFetchingNextPage ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando...
                </>
              ) : (
                <>
                  Cargar más
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          ) : (
            <button
              type="button"
              className="text-xs font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onUseFreeText(trimmed)}
            >
              ¿No está? Taller libre
            </button>
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

/**
 * D-074: modal de confirmación del registro de servicio (owner).
 *
 * Texto EXACTO aprobado (spec 2-3 §4 / D-074). "Cancelar" descarta el modal
 * sin llamada de red (el form queda editable); "Confirmar" dispara el
 * `POST /api/care-episodes/owner` con los datos del form.
 *
 * D-074A (iteración 2-4): cuando el form tiene archivos de evidencia, se
 * suma una segunda oración aclarando que viajan con el registro. [COPY POR
 * CONFIRMAR CON PM — propuesta FE, ver reporte.]
 */
function ConfirmServiceModal({
  evidenceCount,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  evidenceCount: number;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onCancel}
      />
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-service-title"
        className="relative w-full max-w-md"
      >
        <CardContent className="grid gap-4 pt-6">
          <p id="confirm-service-title" className="text-sm">
            No podrás editar ni cancelar este registro desde tu cuenta. Solo el
            taller asignado podrá gestionarlo. ¿Confirmás el registro?
          </p>
          {evidenceCount > 0 && (
            <p className="text-sm text-muted-foreground" role="status">
              {evidenceCount === 1
                ? "Se adjuntará 1 foto como evidencia en el historial del vehículo."
                : `Se adjuntarán ${evidenceCount} fotos como evidencia en el historial del vehículo.`}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={onConfirm} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Confirmar"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}