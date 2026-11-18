"use client";

import { Camera, ImageOff, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { typeScale } from "@/components/ui/type-scale";
import { REMOVAL_UNAUTHORIZED_TOOLTIP } from "@/lib/care-episode-permissions";
import { orderedAttachmentGroups } from "@/lib/attachments";
import type {
  CareEpisodeAttachment,
  CareEpisodeAttachmentGroups,
} from "@/types/care-episode";

/**
 * Iteración 2-4 (S1) — Galería de evidencia del episodio.
 *
 * Render de los grupos que ya vienen agrupados del backend, en el orden UX
 * Antes → Trabajo → Después → General (orderedAttachmentGroups omite vacíos).
 * Cada ítem es una imagen lista (el detalle se carga con signed=true, así que
 * `url` siempre está presente; si no, placeholder defensivo).
 *
 * Eliminación (S5):
 * - `canRemove` → botón ghost por ítem (abre RemoveAttachmentDialog).
 * - `!canRemove` → indicador deshabilitado con tooltip nativo `title` (no
 *   existe primitiva Tooltip en components/ui — decisión FE-2026-024).
 *
 * Presentación (Design System):
 * - Grilla de 2 columnas con miniaturas grandes (una "ficha" visual, no un
 *   mosaico de administración).
 * - Placeholder azul muy claro cuando falta el archivo.
 * - El botón de eliminación mantiene 44px en mobile y se revela al hover/foco
 *   desde `sm` (evita ruido sobre la foto en desktop).
 */
export interface EvidenceGalleryProps {
  groups: CareEpisodeAttachmentGroups;
  /** canRemoveAttachment(ctx) — hint de UI, NO autorización. */
  canRemove: boolean;
  /** Abre el dialog con el adjunto seleccionado. */
  onRemoveRequest?: (attachment: CareEpisodeAttachment) => void;
}

/** Texto del contador por grupo ("2 fotografías"). */
function photoCountLabel(count: number): string {
  return `${count} ${count === 1 ? "fotografía" : "fotografías"}`;
}

export interface EvidenceThumbnailProps {
  attachment: CareEpisodeAttachment;
  /** Hint de UI; la autorización real es del backend. */
  canRemove: boolean;
  onRemoveRequest?: (attachment: CareEpisodeAttachment) => void;
  className?: string;
}

/**
 * EvidenceThumbnail — miniatura de evidencia con su acción.
 *
 * La imagen cubre toda el área (4:3) para que la foto sea el contenido
 * principal. Sin `url` se muestra un placeholder explícito (fondo azul muy
 * claro + icono + texto), nunca un hueco vacío.
 */
export function EvidenceThumbnail({
  attachment,
  canRemove,
  onRemoveRequest,
  className,
}: EvidenceThumbnailProps) {
  const alt = attachment.caption || "Evidencia de servicio";

  return (
    <figure
      className={cn(
        "group relative overflow-hidden rounded-control border border-border bg-muted/40",
        className,
      )}
    >
      {attachment.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada del S3 (R2/B2), sin remotePattern del dominio.
        <img
          src={attachment.url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 bg-primary/5 px-2">
          <ImageOff
            className="size-5 shrink-0 text-primary/50"
            aria-hidden="true"
          />
          <span
            className={cn(
              "text-center text-muted-foreground",
              typeScale.meta,
            )}
          >
            Imagen no disponible
          </span>
        </div>
      )}
      <figcaption className="sr-only">{alt}</figcaption>

      {canRemove && onRemoveRequest ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute right-2 top-2 size-11 rounded-control border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-background focus-visible:ring-2 focus-visible:ring-ring sm:size-8 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
          aria-label={`Eliminar imagen ${alt}`}
          onClick={() => onRemoveRequest(attachment)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      ) : (
        <span
          title={REMOVAL_UNAUTHORIZED_TOOLTIP}
          data-testid="remove-disabled"
          className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-control border border-border/60 bg-background/80 text-muted-foreground sm:size-8"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </span>
      )}
    </figure>
  );
}

export function EvidenceGallery({
  groups,
  canRemove,
  onRemoveRequest,
}: EvidenceGalleryProps) {
  const ordered = orderedAttachmentGroups(groups);

  if (ordered.length === 0) {
    return (
      <EmptyState
        compact
        icon={Camera}
        title="Sin imágenes de evidencia"
        description="Cuando el taller o el propietario adjunten fotos, van a aparecer acá."
      />
    );
  }

  return (
    <div className="grid gap-section">
      {ordered.map((group) => (
        <section
          key={group.key}
          aria-label={`Fase ${group.label}`}
          className="flex flex-col gap-3"
        >
          <SectionHeader
            as="h3"
            title={group.label}
            count={photoCountLabel(group.attachments.length)}
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {group.attachments.map((attachment) => (
              <EvidenceThumbnail
                key={attachment.id}
                attachment={attachment}
                canRemove={canRemove}
                onRemoveRequest={onRemoveRequest}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
