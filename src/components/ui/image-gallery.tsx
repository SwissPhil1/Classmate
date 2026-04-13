"use client";

import { useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Trash2, Pencil, Check } from "lucide-react";
import type { EntityImage, ImageModality } from "@/lib/types";

interface ImageGalleryProps {
  images: EntityImage[];
  onDelete?: (imageId: string) => void;
  onUpdateCaption?: (imageId: string, caption: string | null, modality: ImageModality | null) => void;
  compact?: boolean;
}

const MODALITY_COLORS: Record<string, string> = {
  CT: "bg-blue-500/20 text-blue-400",
  IRM: "bg-purple-500/20 text-purple-400",
  RX: "bg-amber-500/20 text-amber-400",
  US: "bg-green-500/20 text-green-400",
  autre: "bg-gray-500/20 text-gray-400",
};

export function ImageGallery({ images, onDelete, onUpdateCaption, compact = false }: ImageGalleryProps) {
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState("");

  const openFullscreen = useCallback((index: number) => {
    setFullscreenIndex(index);
  }, []);

  const closeFullscreen = useCallback(() => {
    setFullscreenIndex(null);
  }, []);

  const navigateFullscreen = useCallback(
    (direction: -1 | 1) => {
      if (fullscreenIndex === null) return;
      const next = fullscreenIndex + direction;
      if (next >= 0 && next < images.length) {
        setFullscreenIndex(next);
      }
    },
    [fullscreenIndex, images.length]
  );

  const handleStartEdit = (image: EntityImage) => {
    setEditingId(image.id);
    setEditCaption(image.caption || "");
  };

  const handleSaveEdit = (image: EntityImage) => {
    onUpdateCaption?.(image.id, editCaption.trim() || null, image.modality);
    setEditingId(null);
  };

  if (images.length === 0) return null;

  return (
    <>
      {/* Grid */}
      <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {images.map((image, index) => (
          <div key={image.id} className="relative group">
            <button
              onClick={() => openFullscreen(index)}
              className="w-full focus:outline-none focus:ring-2 focus:ring-teal rounded-lg"
            >
              <img
                src={image.url || ""}
                alt={image.caption || "Image radiologique"}
                className={`w-full object-cover rounded-lg border border-border bg-background ${
                  compact ? "h-24" : images.length === 1 ? "max-h-64 object-contain" : "h-32"
                }`}
              />
            </button>

            {/* Modality badge */}
            {image.modality && (
              <span
                className={`absolute top-1.5 left-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  MODALITY_COLORS[image.modality] || MODALITY_COLORS.autre
                }`}
              >
                {image.modality}
              </span>
            )}

            {/* Caption */}
            {image.caption && !compact && (
              <p className="text-[10px] text-muted-foreground mt-1 truncate px-0.5">
                {image.caption}
              </p>
            )}

            {/* Edit/Delete overlay */}
            {(onDelete || onUpdateCaption) && (
              <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onUpdateCaption && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(image);
                    }}
                    className="p-1 bg-background/80 border border-border rounded hover:bg-card transition-colors"
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
                    className="p-1 bg-background/80 border border-border rounded hover:bg-wrong/10 transition-colors"
                  >
                    <Trash2 className="w-3 h-3 text-wrong" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Caption edit inline */}
      {editingId && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={editCaption}
            onChange={(e) => setEditCaption(e.target.value)}
            placeholder="Légende..."
            className="flex-1 h-8 bg-background border border-border rounded-lg px-2 text-xs text-foreground"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const img = images.find((i) => i.id === editingId);
                if (img) handleSaveEdit(img);
              }
            }}
          />
          <button
            onClick={() => {
              const img = images.find((i) => i.id === editingId);
              if (img) handleSaveEdit(img);
            }}
            className="p-1.5 bg-teal/10 text-teal rounded-lg hover:bg-teal/20 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Fullscreen modal */}
      {fullscreenIndex !== null && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={closeFullscreen}
        >
          {/* Close button */}
          <button
            onClick={closeFullscreen}
            className="absolute top-4 right-4 z-10 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* Navigation */}
          {images.length > 1 && fullscreenIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateFullscreen(-1);
              }}
              className="absolute left-4 z-10 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
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
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          )}

          {/* Image */}
          <img
            src={images[fullscreenIndex].url || ""}
            alt={images[fullscreenIndex].caption || "Image radiologique"}
            className="max-w-[95vw] max-h-[90vh] object-contain select-none"
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: "pinch-zoom" }}
          />

          {/* Caption + counter */}
          <div className="absolute bottom-4 left-0 right-0 text-center space-y-1">
            {images[fullscreenIndex].caption && (
              <p className="text-sm text-white/80">{images[fullscreenIndex].caption}</p>
            )}
            {images.length > 1 && (
              <p className="text-xs text-white/50">
                {fullscreenIndex + 1} / {images.length}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
