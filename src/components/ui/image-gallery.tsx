"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Trash2, Pencil, Star, ArrowUp, ArrowDown } from "lucide-react";
import type { EntityImage } from "@/lib/types";
import type { EntityImagePatch } from "@/lib/supabase/queries";
import { ImageEditModal } from "./image-edit-modal";

interface ImageGalleryProps {
  images: EntityImage[];
  onDelete?: (imageId: string) => void;
  onSave?: (imageId: string, patch: EntityImagePatch) => Promise<void> | void;
  onSetCover?: (imageId: string) => Promise<void> | void;
  onReorder?: (imageId: string, direction: -1 | 1) => Promise<void> | void;
  compact?: boolean;
}

const MODALITY_COLORS: Record<string, string> = {
  CT: "bg-blue-500/20 text-blue-400",
  IRM: "bg-purple-500/20 text-purple-400",
  RX: "bg-amber-500/20 text-amber-400",
  US: "bg-green-500/20 text-green-400",
  UIV: "bg-cyan-500/20 text-cyan-400",
  angio: "bg-rose-500/20 text-rose-400",
  autre: "bg-gray-500/20 text-gray-400",
};

function displayLabel(image: EntityImage, fallbackIndex: number): string {
  return image.display_name || image.caption || `Image ${fallbackIndex + 1}`;
}

export function ImageGallery({
  images,
  onDelete,
  onSave,
  onSetCover,
  onReorder,
  compact = false,
}: ImageGalleryProps) {
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [editingImage, setEditingImage] = useState<EntityImage | null>(null);

  const openFullscreen = useCallback((index: number) => {
    setFullscreenIndex(index);
  }, []);

  const closeFullscreen = useCallback(() => {
    setFullscreenIndex(null);
  }, []);

  const navigateFullscreen = useCallback(
    (direction: -1 | 1) => {
      setFullscreenIndex((current) => {
        if (current === null) return null;
        const next = current + direction;
        if (next < 0 || next >= images.length) return current;
        return next;
      });
    },
    [images.length]
  );

  // Keyboard navigation in fullscreen.
  useEffect(() => {
    if (fullscreenIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") navigateFullscreen(-1);
      else if (e.key === "ArrowRight") navigateFullscreen(1);
      else if (e.key === "Escape") closeFullscreen();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreenIndex, navigateFullscreen, closeFullscreen]);

  const handleSwipe = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60) navigateFullscreen(1);
    else if (info.offset.x > 60) navigateFullscreen(-1);
  };

  if (images.length === 0) return null;

  // Responsive grid: 2/3/4 columns. Compact mode: always 3.
  const gridCols = compact
    ? "grid-cols-3"
    : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

  return (
    <>
      <div className={`grid gap-2 ${gridCols}`}>
        {images.map((image, index) => {
          const label = displayLabel(image, index);
          const visibleTags = image.tags.slice(0, 3);
          const overflowTags = image.tags.length - visibleTags.length;
          return (
            <div key={image.id} className="relative group">
              <button
                onClick={() => openFullscreen(index)}
                className="block w-full focus:outline-none focus:ring-2 focus:ring-teal rounded-lg"
              >
                <img
                  src={image.url || ""}
                  alt={label}
                  className={`w-full object-cover rounded-lg border border-border bg-background ${
                    compact ? "h-20" : "h-28 sm:h-32"
                  }`}
                />
              </button>

              {/* Cover badge */}
              {image.is_cover && (
                <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/90 text-white text-[10px] font-semibold rounded">
                  <Star className="w-2.5 h-2.5 fill-current" /> cover
                </span>
              )}

              {/* Modality badge */}
              {image.modality && !image.is_cover && (
                <span
                  className={`absolute top-1.5 left-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    MODALITY_COLORS[image.modality] || MODALITY_COLORS.autre
                  }`}
                >
                  {image.modality}
                  {image.sequence ? ` · ${image.sequence}` : ""}
                </span>
              )}

              {/* Hover/touch action overlay */}
              {(onSave || onDelete || onReorder) && (
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  {onReorder && index > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void onReorder(image.id, -1);
                      }}
                      className="p-1 bg-background/90 border border-border rounded hover:bg-card transition-colors"
                      aria-label="Monter"
                    >
                      <ArrowUp className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}
                  {onReorder && index < images.length - 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void onReorder(image.id, 1);
                      }}
                      className="p-1 bg-background/90 border border-border rounded hover:bg-card transition-colors"
                      aria-label="Descendre"
                    >
                      <ArrowDown className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}
                  {onSave && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingImage(image);
                      }}
                      className="p-1 bg-background/90 border border-border rounded hover:bg-card transition-colors"
                      aria-label="Éditer"
                    >
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(image.id);
                      }}
                      className="p-1 bg-background/90 border border-border rounded hover:bg-wrong/10 transition-colors"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="w-3 h-3 text-wrong" />
                    </button>
                  )}
                </div>
              )}

              {/* Caption + tags below thumbnail */}
              {!compact && (
                <div className="mt-1 px-0.5 space-y-0.5">
                  <p className="text-[11px] text-foreground font-medium truncate">{label}</p>
                  {visibleTags.length > 0 && (
                    <div className="flex flex-wrap gap-0.5">
                      {visibleTags.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0 rounded-full bg-teal/10 text-teal text-[9px] font-medium"
                        >
                          {t}
                        </span>
                      ))}
                      {overflowTags > 0 && (
                        <span className="px-1.5 py-0 rounded-full bg-card border border-border text-muted-foreground text-[9px]">
                          +{overflowTags}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit modal */}
      {editingImage && onSave && (
        <ImageEditModal
          image={editingImage}
          onSave={async (patch) => {
            const turningOn = patch.is_cover && !editingImage.is_cover;
            const turningOff = !patch.is_cover && editingImage.is_cover;

            // Apply non-cover fields first (always safe vs the partial unique index).
            const { is_cover: _ignored, ...rest } = patch;
            void _ignored;
            await onSave(editingImage.id, rest);

            if (turningOn && onSetCover) {
              // Two sequential UPDATEs (clear old, set new) to avoid colliding
              // with idx_entity_images_cover_per_entity.
              await onSetCover(editingImage.id);
            } else if (turningOff) {
              // Clearing cover never collides — single UPDATE is enough.
              await onSave(editingImage.id, { is_cover: false });
            }
          }}
          onClose={() => setEditingImage(null)}
        />
      )}

      {/* Fullscreen lightbox */}
      <AnimatePresence>
        {fullscreenIndex !== null && images[fullscreenIndex] && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
            onClick={closeFullscreen}
          >
            <button
              onClick={closeFullscreen}
              className="absolute top-4 right-4 z-10 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
              aria-label="Fermer"
            >
              <X className="w-6 h-6 text-white" />
            </button>

            {images.length > 1 && fullscreenIndex > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateFullscreen(-1);
                }}
                className="absolute left-4 z-10 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                aria-label="Précédent"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>
            )}
            {images.length > 1 && fullscreenIndex < images.length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateFullscreen(1);
                }}
                className="absolute right-4 z-10 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                aria-label="Suivant"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            )}

            <motion.img
              key={images[fullscreenIndex].id}
              src={images[fullscreenIndex].url || ""}
              alt={displayLabel(images[fullscreenIndex], fullscreenIndex)}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.18 }}
              drag={images.length > 1 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleSwipe}
              className="max-w-[95vw] max-h-[90vh] object-contain select-none"
              onClick={(e) => e.stopPropagation()}
              style={{ touchAction: "pinch-zoom" }}
            />

            <div className="absolute bottom-4 left-0 right-0 text-center space-y-1 px-4">
              <p className="text-sm text-white font-medium">
                {displayLabel(images[fullscreenIndex], fullscreenIndex)}
              </p>
              {images[fullscreenIndex].caption &&
                images[fullscreenIndex].caption !== images[fullscreenIndex].display_name && (
                  <p className="text-xs text-white/70">{images[fullscreenIndex].caption}</p>
                )}
              {images.length > 1 && (
                <p className="text-xs text-white/50">
                  {fullscreenIndex + 1} / {images.length}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
