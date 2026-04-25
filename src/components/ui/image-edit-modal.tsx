"use client";

import { useEffect, useState, useMemo } from "react";
import { X, Star, Plus } from "lucide-react";
import type { EntityImage, ImageModality } from "@/lib/types";

const MODALITY_OPTIONS: { value: ImageModality; label: string }[] = [
  { value: "CT", label: "CT" },
  { value: "IRM", label: "IRM" },
  { value: "RX", label: "RX" },
  { value: "US", label: "US" },
  { value: "UIV", label: "UIV" },
  { value: "angio", label: "Angio" },
  { value: "autre", label: "Autre" },
];

const SEQUENCE_OPTIONS = ["T1", "T2", "STIR", "DWI", "T1 FS", "T2 FS", "T1 GADO"] as const;

export interface ImageEditPatch {
  display_name: string | null;
  caption: string | null;
  tags: string[];
  modality: ImageModality | null;
  sequence: string | null;
  source_url: string | null;
  is_cover: boolean;
}

interface ImageEditModalProps {
  image: EntityImage;
  onSave: (patch: ImageEditPatch) => Promise<void> | void;
  onClose: () => void;
}

function deriveDefaultName(image: EntityImage): string {
  const tail = image.storage_path.split("/").pop() || "";
  return tail.replace(/\.[^.]+$/, "");
}

export function ImageEditModal({ image, onSave, onClose }: ImageEditModalProps) {
  const placeholder = useMemo(() => deriveDefaultName(image), [image]);
  const [displayName, setDisplayName] = useState(image.display_name ?? "");
  const [caption, setCaption] = useState(image.caption ?? "");
  const [tags, setTags] = useState<string[]>(image.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [modality, setModality] = useState<ImageModality | null>(image.modality);
  const [sequence, setSequence] = useState<string | null>(image.sequence);
  const [sourceUrl, setSourceUrl] = useState(image.source_url ?? "");
  const [isCover, setIsCover] = useState(image.is_cover);
  const [saving, setSaving] = useState(false);

  // Reset sequence when modality changes away from IRM.
  useEffect(() => {
    if (modality !== "IRM") setSequence(null);
  }, [modality]);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (tags.includes(t)) {
      setTagInput("");
      return;
    }
    setTags([...tags, t]);
    setTagInput("");
  };

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        display_name: displayName.trim() || null,
        caption: caption.trim() || null,
        tags,
        modality,
        sequence: modality === "IRM" ? sequence : null,
        source_url: sourceUrl.trim() || null,
        is_cover: isCover,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card">
          <h2 className="text-base font-semibold text-foreground">Éditer l&apos;image</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Preview */}
          {image.url && (
            <img
              src={image.url}
              alt={image.caption || "Image"}
              className="w-full max-h-40 object-contain rounded-lg border border-border bg-background"
            />
          )}

          {/* Display name */}
          <Field label="Nom (court)">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={placeholder}
              className="w-full h-10 bg-background border border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </Field>

          {/* Caption */}
          <Field label="Légende">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              placeholder="Description longue (optionnel)"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-y"
            />
          </Field>

          {/* Tags */}
          <Field label="Tags">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal/10 text-teal text-xs font-medium"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="hover:text-teal-light"
                    aria-label={`Supprimer tag ${t}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="high-yield, classique..."
                className="flex-1 h-9 bg-background border border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={addTag}
                className="h-9 px-3 flex items-center gap-1 bg-card border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Ajouter
              </button>
            </div>
          </Field>

          {/* Modality */}
          <Field label="Modalité">
            <div className="flex flex-wrap gap-1.5">
              {MODALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
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
          </Field>

          {/* Sequence (IRM only) */}
          {modality === "IRM" && (
            <Field label="Séquence">
              <div className="flex flex-wrap gap-1.5">
                {SEQUENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSequence(sequence === opt ? null : opt)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      sequence === opt
                        ? "bg-purple-500 text-white"
                        : "bg-card border border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {/* Source URL */}
          <Field label="Source (URL)">
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://radiopaedia.org/..."
              className="w-full h-10 bg-background border border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </Field>

          {/* Cover toggle */}
          <button
            type="button"
            onClick={() => setIsCover(!isCover)}
            className={`w-full h-11 flex items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors ${
              isCover
                ? "bg-amber-500/10 border-amber-500/40 text-amber-500"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Star className={`w-4 h-4 ${isCover ? "fill-current" : ""}`} />
            {isCover ? "Cover de l'entité" : "Définir comme cover"}
          </button>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border sticky bottom-0 bg-card">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 bg-card border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-11 bg-teal hover:bg-teal-light text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
