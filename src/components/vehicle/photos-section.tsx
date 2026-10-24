"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Loader2, RotateCw, Star, Trash2, Upload } from "lucide-react";
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
import { errorStatus } from "@/lib/api-error";
import { SIGNED_URL_REFRESH_THRESHOLD_MS } from "@/lib/constants";
import { vehicleApi } from "@/lib/api";
import { VehicleMediaViewer, type MediaViewerItem } from "./vehicle-media-viewer";
import type { VehiclePhoto } from "@/types/vehicle";

/** ¿La URL firmada vence en menos del umbral? (Chequeo al abrir el visor.) */
function isUrlExpiringSoon(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() < SIGNED_URL_REFRESH_THRESHOLD_MS;
}

/**
 * F-013 — Sección de fotos del detalle de vehículo.
 * Grid de miniaturas + visor full-screen (lightbox) mobile-first.
 * Escrita por owner (D-048); lectores ven solo la grilla y el visor.
 */
export function PhotosSection({
  vehicleId,
  canWrite,
  photos,
  isLoading,
  isError,
  refetch,
}: {
  vehicleId: string;
  canWrite: boolean;
  photos: VehiclePhoto[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}) {
  const queryClient = useQueryClient();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Índice de la foto abierta en el visor; null = cerrado.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["vehicle", vehicleId, "photos"] });

  const uploadPhoto = useMutation({
    mutationFn: (file: File) => vehicleApi.uploadPhoto(vehicleId, file),
    onSuccess: () => {
      setUploadError(null);
      invalidate();
    },
  });

  const setPrimary = useMutation({
    mutationFn: (photoId: string) =>
      vehicleApi.setPrimaryPhoto(vehicleId, photoId),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (photoId: string) => vehicleApi.deletePhoto(vehicleId, photoId),
    onSuccess: invalidate,
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    uploadPhoto.mutate(file, {
      onError: (error) => {
        const status = errorStatus(error);
        if (status === 400) {
          setUploadError(
            "El archivo no es una imagen válida (JPG, PNG, WebP o AVIF) o supera los 10MB.",
          );
        } else if (status === 403) {
          setUploadError("No tenés permiso para modificar las fotos de este vehículo.");
        } else {
          setUploadError("No se pudo subir la foto. Intentalo nuevamente.");
        }
      },
    });
  };

  const [photoToDelete, setPhotoToDelete] = useState<VehiclePhoto | null>(null);

  const handleDelete = (photo: VehiclePhoto) => {
    setPhotoToDelete(photo);
  };

  const confirmDelete = () => {
    if (!photoToDelete) return;
    remove.mutate(photoToDelete.id);
    setPhotoToDelete(null);
  };

  // --- Visor ----------------------------------------------------------------

  const openViewer = (index: number) => {
    const photo = photos[index];
    if (!photo?.url) return;
    // Refetch preventivo si la URL firmada está por expirar (< 60 s).
    if (isUrlExpiringSoon(photo.expiresAt)) {
      invalidate();
    }
    setViewerIndex(index);
  };

  /** Refetch puntual de la URL firmada de una foto (expirada o fallida). */
  const refetchPhotoUrl = async (photoId: string): Promise<string | undefined> => {
    try {
      const result = await vehicleApi.getPhotoSignedUrl(vehicleId, photoId);
      return result?.url;
    } catch {
      return undefined;
    }
  };

  const viewerItems: MediaViewerItem[] = photos
    .filter((photo) => photo.url)
    .map((photo) => ({
      id: photo.id,
      url: photo.url,
      alt: photo.caption ?? "Foto del vehículo",
      caption: photo.caption,
      createdAt: photo.createdAt,
    }));

  // Mapea índice del grid (todas las fotos) → índice del visor (solo con URL).
  const viewerIndexFromGrid =
    viewerIndex !== null
      ? viewerItems.findIndex((item) => item.id === photos[viewerIndex]?.id)
      : -1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fotos</CardTitle>
        <CardDescription>
          {photos.length > 0
            ? `${photos.length} ${photos.length === 1 ? "foto" : "fotos"} — la foto principal se muestra primero.`
            : "Documentá visualmente el vehículo."}
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
              No se pudieron cargar las fotos.
            </p>
            <Button variant="outline" size="sm" onClick={refetch}>
              <RotateCw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
          </div>
        ) : photos.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Todavía no hay fotos de este vehículo.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="relative overflow-hidden rounded-lg ring-1 ring-foreground/10"
              >
                {photo.url ? (
                  // La miniatura abre el visor full-screen. Las acciones
                  // canWrite del overlay son hermanas (no hijos) del botón,
                  // así que no disparan la apertura.
                  <button
                    type="button"
                    aria-label={`Ver foto ${index + 1} de ${photos.length}${photo.caption ? `, ${photo.caption}` : ""}`}
                    className="block w-full cursor-zoom-in"
                    onClick={() => openViewer(index)}
                  >
                    {/* Signed R2 URL (batch ?signed=true). Al no conocer el host
                        al build-time usamos <img> nativo (sin next/image) —
                        aceptable para un set limitado de fotos (D-047 MVP). */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.caption ?? "Foto del vehículo"}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-muted/40">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                )}
                {photo.isPrimary && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-primary/90 px-1.5 py-0.5 text-[0.65rem] font-medium text-primary-foreground">
                    Principal
                  </span>
                )}
                {canWrite && (
                  <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-1 bg-background/80 p-1.5 backdrop-blur-sm">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-label="Establecer como principal"
                      title="Establecer como principal"
                      disabled={photo.isPrimary || setPrimary.isPending}
                      onClick={() => setPrimary.mutate(photo.id)}
                    >
                      <Star
                        className={
                          photo.isPrimary
                            ? "fill-foreground text-foreground"
                            : ""
                        }
                      />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-label="Eliminar foto"
                      title="Eliminar foto"
                      disabled={remove.isPending}
                      onClick={() => handleDelete(photo)}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {uploadError && (
          <p className="text-sm text-destructive" role="alert">
            {uploadError}
          </p>
        )}

        {canWrite && (
          <div className="flex flex-col gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={uploadPhoto.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {uploadPhoto.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Subir foto
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>

      {/* Visor full-screen de fotos (lightbox). */}
      {viewerIndexFromGrid >= 0 && (
        <VehicleMediaViewer
          open={viewerIndex !== null}
          onClose={() => setViewerIndex(null)}
          items={viewerItems}
          index={viewerIndexFromGrid}
          onIndexChange={(nextIndex) => {
            // El visor navega sobre items con URL; mapear de vuelta al índice
            // real del grid no es necesario para el estado — el visor solo
            // necesita el índice dentro de viewerItems.
            setViewerIndex(
              photos.findIndex((photo) => photo.id === viewerItems[nextIndex]?.id),
            );
          }}
          mediaKind="photo"
          onRefetchUrl={refetchPhotoUrl}
        />
      )}

      {/* Dialog de confirmación para eliminar foto */}
      <Dialog
        open={photoToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPhotoToDelete(null);
        }}
      >
        <DialogPopup>
          <DialogTitle>Eliminar foto</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de que querés eliminar esta foto? Esta acción no se
            puede deshacer.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button variant="outline" disabled={remove.isPending} />}>
              Cancelar
            </DialogClose>
            <Button
              variant="destructive"
              onClick={confirmDelete}
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
