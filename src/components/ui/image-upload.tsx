"use client";

import { useState, useRef, useCallback } from "react";
import { ImagePlus, X, Loader2 } from "lucide-react";
import type { ImageModality } from "@/lib/types";

interface ImageUploadProps {
  onUpload: (file: File, modality: ImageModality | null, caption: string | null) => Promise<void>;
  uploading?: boolean;
  compact?: boolean;
}

const MODALITY_OPTIONS: { value: ImageModality; label: string }[] = [
  { value: "CT", label: "CT" },
  { value: "IRM", label: "IRM" },
  { value: "RX", label: "RX" },
  { value: "US", label: "US" },
  { value: "autre", label: "Autre" },
];

export function ImageUpload({ onUpload, uploading = false, compact = false }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modality, setModality] = useState<ImageModality | null>(null);
  const [caption, setCaption] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback((file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert("Image trop volumineuse (max 5 Mo)");
      return;
    }
    if (!file.type.startsWith("image/")) {
      alert("Format non supporté. Utilisez une image.");
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleFile(file);
          return;
        }
      }
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    await onUpload(selectedFile, modality, caption.trim() || null);
    // Reset after upload
    setPreview(null);
    setSelectedFile(null);
    setModality(null);
    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClear = () => {
    setPreview(null);
    setSelectedFile(null);
    setModality(null);
    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (preview && selectedFile) {
    return (
      <div className="space-y-3">
        {/* Preview */}
        <div className="relative">
          <img
            src={preview}
            alt="Aperçu"
            className="w-full max-h-48 object-contain rounded-lg border border-border bg-background"
          />
          <button
            onClick={handleClear}
            className="absolute top-2 right-2 p-1.5 bg-background/80 border border-border rounded-lg hover:bg-card transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Modality selector */}
        <div className="flex flex-wrap gap-1.5">
          {MODALITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setModality(modality === opt.value ? null : opt.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                modality === opt.value
                  ? "bg-teal text-white"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Caption */}
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Légende (optionnel)"
          className="w-full h-9 bg-background border border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground"
        />

        {/* Upload button */}
        <button
          onClick={handleSubmit}
          disabled={uploading}
          className="w-full h-10 flex items-center justify-center gap-2 bg-teal hover:bg-teal-light text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Upload en cours...
            </>
          ) : (
            <>
              <ImagePlus className="w-4 h-4" />
              Ajouter l&apos;image
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={dropZoneRef}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => fileInputRef.current?.click()}
      tabIndex={0}
      role="button"
      aria-label="Ajouter une image"
      className={`flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl cursor-pointer
        hover:border-teal/50 hover:bg-teal/5 transition-colors
        ${compact ? "h-20 px-3" : "h-32 px-4"}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        className="hidden"
      />
      <ImagePlus className={`text-muted-foreground ${compact ? "w-5 h-5" : "w-6 h-6"}`} />
      <div className="text-center">
        <p className={`text-muted-foreground font-medium ${compact ? "text-xs" : "text-sm"}`}>
          {compact ? "Ajouter image" : "Cliquez ou collez une image"}
        </p>
        {!compact && (
          <p className="text-xs text-muted-foreground mt-0.5">
            JPG, PNG, WebP — max 5 Mo
          </p>
        )}
      </div>
    </div>
  );
}
