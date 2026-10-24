"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, RotateCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { errorStatus } from "@/lib/api-error";
import {
  CATALOG_STALE_TIME,
  SIGNED_URL_REFRESH_THRESHOLD_MS,
} from "@/lib/constants";
import { vehicleApi } from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { VehicleMediaViewer, type MediaViewerItem } from "./vehicle-media-viewer";
import { DocumentPreviewDialog } from "./document-preview-dialog";
import type { VehicleDocument, VehicleDocumentTypeOption } from "@/types/vehicle";

/** Detección de imagen por extensión del key (el schema NO expone mimeType). */
function isImageDocument(doc: VehicleDocument): boolean {
  return /\.(jpe?g|png|webp|avif)$/i.test(doc.key);
}

/** Detección de PDF por extensión del key (mismo criterio que isImageDocument). */
function isPdfDocument(doc: VehicleDocument): boolean {
  return /\.pdf$/i.test(doc.key);
}

/** ¿La URL firmada vence en menos del umbral? (Chequeo al abrir el preview.) */
function isUrlExpiringSoon(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() < SIGNED_URL_REFRESH_THRESHOLD_MS;
}

/**
 * F-013 — Sección de documentos del detalle de vehículo.
 * Lista con descarga (conservada) + preview: imágenes abren el visor
 * full-screen; PDFs abren un preview iframe (fallback nativo en iOS).
 * Escrita por owner (D-048); lectores ven solo la lista y los previews.
 */
export function DocumentsSection({
  vehicleId,
  canWrite,
  documents,
  isLoading,
  isError,
  refetch,
}: {
  vehicleId: string;
  canWrite: boolean;
  documents: VehicleDocument[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}) {
  const queryClient = useQueryClient();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<VehicleDocument | null>(null);

  // Preview state: imagen (visor) o PDF (iframe/Quick Look).
  const [imagePreviewId, setImagePreviewId] = useState<string | null>(null);
  const [pdfPreviewDoc, setPdfPreviewDoc] = useState<VehicleDocument | null>(null);
  // URL firmada refrescada bajo demanda (expiración de la URL batch).
  const [urlOverrides, setUrlOverrides] = useState<Record<string, string>>({});

  // Catálogo de tipos de documento (GET /vehicles/documents/types — estático
  // del backend, staleTime largo = cache del lado cliente).
  const { data: docTypeOptions = [] } = useQuery<VehicleDocumentTypeOption[]>({
    queryKey: ["vehicle-document-types"],
    queryFn: () => vehicleApi.getDocumentTypes(),
    staleTime: CATALOG_STALE_TIME,
  });

  /**
   * Label de UI para un `documentType`: resuelve contra el catálogo; los
   * valores legacy fuera del catálogo (ej. "Cédula") se muestran tal cual.
   */
  const typeLabel = (value: string): string =>
    docTypeOptions.find((option) => option.value === value)?.label ?? value;

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadType, setUploadType] = useState("");
  const [uploadExpiry, setUploadExpiry] = useState("");

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editExpiry, setEditExpiry] = useState("");

  /**
   * Opciones efectivas para el Select de edición: catálogo + (si el documento
   * tiene un tipo legacy fuera del catálogo) una opción extra con su valor
   * actual, para no perderlo al editar.
   */
  const effectiveEditOptions = (): VehicleDocumentTypeOption[] =>
    editType && !docTypeOptions.some((option) => option.value === editType)
      ? [...docTypeOptions, { value: editType, label: editType }]
      : docTypeOptions;

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["vehicle", vehicleId, "documents"],
    });

  const upload = useMutation({
    mutationFn: (args: { file: File; name: string; documentType: string; expiresAt?: string }) =>
      vehicleApi.uploadDocument(vehicleId, args.file, {
        name: args.name,
        documentType: args.documentType,
        expiresAt: args.expiresAt || undefined,
      }),
    onSuccess: () => {
      setUploadError(null);
      setUploadFile(null);
      setUploadName("");
      setUploadType("");
      setUploadExpiry("");
      setShowUpload(false);
      invalidate();
    },
  });

  const updateDoc = useMutation({
    mutationFn: (args: { docId: string; name: string; documentType: string; expiresAt?: string | null }) =>
      vehicleApi.updateDocument(vehicleId, args.docId, {
        name: args.name,
        documentType: args.documentType,
        expiresAt: args.expiresAt === "" ? null : args.expiresAt,
      }),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (docId: string) => vehicleApi.deleteDocument(vehicleId, docId),
    onSuccess: invalidate,
  });

  const handleUploadSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setUploadError(null);
    if (!uploadFile) return;
    // Tipo es OPCIONAL (catálogo predefinido con opción vacía): la subida de
    // documentos no se condiciona a elegir un tipo.
    if (!uploadName.trim()) return;
    upload.mutate(
      {
        file: uploadFile,
        name: uploadName.trim(),
        documentType: uploadType.trim(),
        expiresAt: uploadExpiry || undefined,
      },
      {
        onError: (error) => {
          const status = errorStatus(error);
          if (status === 400) {
            setUploadError(
              "El archivo no es válido (imagen o PDF, máximo 10MB) o faltan datos.",
            );
          } else if (status === 403) {
            setUploadError("No tenés permiso para modificar los documentos de este vehículo.");
          } else {
            setUploadError("No se pudo subir el documento. Intentalo nuevamente.");
          }
        },
      },
    );
  };

  const startEdit = (doc: VehicleDocument) => {
    setEditingId(doc.id);
    setEditName(doc.name);
    setEditType(doc.documentType);
    setEditExpiry(doc.expiresAt ? doc.expiresAt.slice(0, 10) : "");
  };

  const handleEditSubmit = (event: React.FormEvent, docId: string) => {
    event.preventDefault();
    updateDoc.mutate(
      {
        docId,
        name: editName.trim(),
        documentType: editType.trim(),
        expiresAt: editExpiry === "" ? null : editExpiry,
      },
      {
        onError: (error) => {
          const status = errorStatus(error);
          if (status === 403) {
            setUploadError("No tenés permiso para modificar los documentos de este vehículo.");
          } else {
            setUploadError("No se pudo actualizar el documento. Intentalo nuevamente.");
          }
        },
      },
    );
  };

  // --- Preview --------------------------------------------------------------

  const effectiveUrl = (doc: VehicleDocument): string | undefined =>
    urlOverrides[doc.id] ?? doc.url;

  /** Refetch puntual de la URL firmada de un documento (expirada/fallida). */
  const refetchDocUrl = async (docId: string): Promise<string | undefined> => {
    try {
      const result = await vehicleApi.getDocumentSignedUrl(vehicleId, docId);
      const freshUrl = result?.url;
      if (freshUrl) {
        setUrlOverrides((prev) => ({ ...prev, [docId]: freshUrl }));
      }
      return freshUrl;
    } catch {
      return undefined;
    }
  };

  const openPreview = (doc: VehicleDocument) => {
    if (editingId === doc.id) return;
    if (!effectiveUrl(doc)) return;
    // Refetch preventivo si la URL firmada está por expirar (< 60 s).
    if (isUrlExpiringSoon(doc.urlExpiresAt)) {
      invalidate();
    }
    if (isImageDocument(doc)) {
      setImagePreviewId(doc.id);
    } else if (isPdfDocument(doc)) {
      setPdfPreviewDoc(doc);
    }
    // Otros tipos: sin preview (solo descarga) — no se finge visualización.
  };

  const imagePreviewDoc =
    imagePreviewId !== null
      ? (documents.find((doc) => doc.id === imagePreviewId) ?? null)
      : null;

  const imagePreviewItems: MediaViewerItem[] = imagePreviewDoc
    ? [
        {
          id: imagePreviewDoc.id,
          url: effectiveUrl(imagePreviewDoc),
          alt: imagePreviewDoc.name,
          caption: imagePreviewDoc.name,
          createdAt: imagePreviewDoc.createdAt,
        },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos</CardTitle>
        <CardDescription>
          {documents.length > 0
            ? `${documents.length} ${documents.length === 1 ? "documento" : "documentos"}.`
            : "Cargá documentos como cédula, seguro o VTV."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No se pudieron cargar los documentos.
            </p>
            <Button variant="outline" size="sm" onClick={refetch}>
              <RotateCw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
          </div>
        ) : documents.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay documentos cargados.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {documents.map((doc) => {
              const url = effectiveUrl(doc);
              const previewable =
                !!url && (isImageDocument(doc) || isPdfDocument(doc));
              return (
                <li
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg ring-1 ring-foreground/10 p-2"
                >
                  {url && isImageDocument(doc) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={doc.name}
                      loading="lazy"
                      className="h-12 w-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted/50">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}

                  {editingId === doc.id ? (
                    <form
                      className="grid flex-1 gap-2"
                      onSubmit={(e) => handleEditSubmit(e, doc.id)}
                    >
                      <div className="grid gap-1.5">
                        <Label htmlFor={`doc-name-${doc.id}`} className="text-xs">
                          Nombre
                        </Label>
                        <Input
                          id={`doc-name-${doc.id}`}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`doc-type-${doc.id}`} className="text-xs">
                          Tipo
                        </Label>
                        <Select
                          id={`doc-type-${doc.id}`}
                          value={editType}
                          onChange={(e) => setEditType(e.target.value)}
                        >
                          <option value="">Sin tipo</option>
                          {effectiveEditOptions().map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`doc-expiry-${doc.id}`} className="text-xs">
                          Vence (opcional)
                        </Label>
                        <Input
                          id={`doc-expiry-${doc.id}`}
                          type="date"
                          value={editExpiry}
                          onChange={(e) => setEditExpiry(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm">
                          Guardar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {/* El área de metadata es el target de toque del preview
                          (fila completa accesible ≥44px). Las acciones
                          (descarga/ediciones) son hermanas con z-10. */}
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left disabled:cursor-default"
                        disabled={!previewable}
                        aria-label={
                          previewable
                            ? `Ver ${isPdfDocument(doc) ? "documento" : "imagen"} ${doc.name}`
                            : undefined
                        }
                        onClick={() => openPreview(doc)}
                      >
                        <p className="truncate text-sm font-medium">{doc.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {typeLabel(doc.documentType)}
                          {doc.expiresAt
                            ? ` · vence ${formatDate(doc.expiresAt)}`
                            : ""}
                        </p>
                      </button>
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Descargar ${doc.name}`}
                          title="Descargar"
                          className="z-10 flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                      {canWrite && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => startEdit(doc)}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            aria-label={`Eliminar documento ${doc.name}`}
                            onClick={() => setDocToDelete(doc)}
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {uploadError && (
          <p className="text-sm text-destructive" role="alert">
            {uploadError}
          </p>
        )}

        {canWrite && (
          <div className="flex flex-col gap-2">
            {showUpload ? (
              <form
                className="grid gap-3 rounded-lg ring-1 ring-foreground/10 p-3"
                onSubmit={handleUploadSubmit}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-upload-file">Archivo</Label>
                  <Input
                    id="doc-upload-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif,application/pdf"
                    required
                    onChange={(e) =>
                      setUploadFile(e.target.files?.[0] ?? null)
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-upload-name">Nombre</Label>
                  <Input
                    id="doc-upload-name"
                    placeholder="Ej. Cédula verde"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-upload-type">Tipo (opcional)</Label>
                  <Select
                    id="doc-upload-type"
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                  >
                    <option value="">Seleccioná un tipo…</option>
                    {docTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-upload-expiry">
                    Vencimiento (opcional)
                  </Label>
                  <Input
                    id="doc-upload-expiry"
                    type="date"
                    value={uploadExpiry}
                    onChange={(e) => setUploadExpiry(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={upload.isPending || !uploadFile}
                  >
                    {upload.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Subiendo...
                      </>
                    ) : (
                      "Subir documento"
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowUpload(false);
                      setUploadError(null);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setShowUpload(true)}
              >
                <Upload className="h-4 w-4" />
                Subir documento
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {/* Visor full-screen de imagen-documento (un solo ítem). */}
      {imagePreviewDoc && (
        <VehicleMediaViewer
          open={imagePreviewId !== null}
          onClose={() => setImagePreviewId(null)}
          items={imagePreviewItems}
          index={0}
          onIndexChange={() => {}}
          mediaKind="document-image"
          onRefetchUrl={refetchDocUrl}
          downloadUrl={effectiveUrl(imagePreviewDoc)}
        />
      )}

      {/* Preview full-screen de PDF (iframe en desktop/Android, Quick Look en iOS). */}
      {pdfPreviewDoc && (
        <DocumentPreviewDialog
          open={pdfPreviewDoc !== null}
          onClose={() => setPdfPreviewDoc(null)}
          doc={pdfPreviewDoc}
          url={effectiveUrl(pdfPreviewDoc) ?? ""}
        />
      )}

      {/* Dialog de confirmación para eliminar documento */}
      <Dialog
        open={docToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setDocToDelete(null);
        }}
      >
        <DialogPopup>
          <DialogTitle>Eliminar documento</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de que querés eliminar &quot;{docToDelete?.name}&quot;?
            Esta acción no se puede deshacer.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button variant="outline" disabled={remove.isPending} />}>
              Cancelar
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (docToDelete) {
                  remove.mutate(docToDelete.id);
                  setDocToDelete(null);
                }
              }}
              disabled={remove.isPending}
            >
              {remove.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                "Eliminar"
              )}
            </Button>
          </div>
        </DialogPopup>
      </Dialog>
    </Card>
  );
}
