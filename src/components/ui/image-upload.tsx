"use client";

import { useEffect, useCallback, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { ImagePlus, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useImageUpload } from "@/hooks/use-image-upload";
import type { EntityImage } from "@/lib/types";

interface ImageUploadProps {
  userId: string;
  entityId: string;
  /** display_order to assign to the first uploaded image of this batch. */
  baseDisplayOrder: number;
  onSaved: (image: EntityImage) => void;
  compact?: boolean;
}

export function ImageUpload({ userId, entityId, baseDisplayOrder, onSaved, compact = false }: ImageUploadProps) {
  const { upload, progress, clearCompleted } = useImageUpload({
    userId,
    entityId,
    baseDisplayOrder,
    onSaved: (image) => {
      onSaved(image);
      toast.success("Image ajoutée");
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      // react-dropzone discards the original DataTransfer, so we lose the
      // text/uri-list source URL when files are dropped from another Safari
      // window. Best-effort: leave source_url null here; user can fill it via
      // the edit modal after save.
      void upload(acceptedFiles, null);
    },
    [upload]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: true,
    noClick: true,
    noKeyboard: true,
  });

  // Global paste listener — paste images from clipboard anywhere on the page.
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        void upload(files, null);
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [upload]);

  const items = useMemo(() => Array.from(progress.values()), [progress]);
  const hasErrors = items.some((it) => it.status === "error");
  const hasSaved = items.some((it) => it.status === "saved");

  // Auto-clear successful entries after a short delay so the list stays tidy.
  useEffect(() => {
    if (!hasSaved) return;
    const t = setTimeout(() => clearCompleted(), 2500);
    return () => clearTimeout(t);
  }, [hasSaved, clearCompleted]);

  // Surface error toasts on transition into 'error'.
  useEffect(() => {
    for (const it of items) {
      if (it.status === "error" && it.error && !shownErrors.has(it.fileId)) {
        toast.error(`${it.fileName}: ${it.error}`);
        shownErrors.add(it.fileId);
      }
    }
  }, [items]);

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        onClick={() => open()}
        role="button"
        aria-label="Ajouter des images (drop, paste ou tap)"
        className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl cursor-pointer transition-colors
          ${isDragActive ? "border-teal bg-teal/10" : "border-border hover:border-teal/50 hover:bg-teal/5"}
          ${compact ? "h-20 px-3" : "h-28 px-4"}`}
      >
        <input {...getInputProps()} />
        <ImagePlus className={`text-muted-foreground ${compact ? "w-5 h-5" : "w-6 h-6"}`} />
        <p className={`text-muted-foreground font-medium text-center ${compact ? "text-xs" : "text-sm"}`}>
          {isDragActive ? "Lâche ici" : compact ? "Ajouter images" : "Glisse, colle ou tape pour ajouter"}
        </p>
        {!compact && (
          <p className="text-[11px] text-muted-foreground">
            Compression auto · WebP · max 2048 px
          </p>
        )}
      </div>

      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li
              key={it.fileId}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs"
            >
              <StatusIcon status={it.status} />
              <span className="flex-1 truncate text-foreground">{it.fileName}</span>
              <span className="text-muted-foreground tabular-nums">
                {it.status === "saved" ? "OK" : it.status === "error" ? "échec" : `${it.pct}%`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {hasErrors && (
        <p className="text-[11px] text-wrong px-1">
          Au moins une image a échoué — relance-la depuis ton appareil.
        </p>
      )}
    </div>
  );
}

// Module-level set so we don't show the same error toast twice across renders.
const shownErrors = new Set<string>();

function StatusIcon({ status }: { status: "compressing" | "uploading" | "saved" | "error" }) {
  if (status === "saved") return <CheckCircle2 className="w-3.5 h-3.5 text-correct" />;
  if (status === "error") return <AlertCircle className="w-3.5 h-3.5 text-wrong" />;
  return <Loader2 className="w-3.5 h-3.5 animate-spin text-teal" />;
}
