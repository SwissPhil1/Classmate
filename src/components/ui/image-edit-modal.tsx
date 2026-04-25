"use client";

import { useEffect, useState, useMemo } from "react";
import { X, Star, Plus, Sparkles, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { EntityImage, ImageAIBrief, ImageAIBriefStatus, ImageModality } from "@/lib/types";

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
  /** Optional: triggers re-analysis. Caller surfaces the new brief via prop refresh. */
  onReanalyze?: (imageId: string) => Promise<void> | void;
  onClose: () => void;
}

function deriveDefaultName(image: EntityImage): string {
  const tail = image.storage_path.split("/").pop() || "";
  return tail.replace(/\.[^.]+$/, "");
}

export function ImageEditModal({ image, onSave, onReanalyze, onClose }: ImageEditModalProps) {
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

          {/* AI brief panel */}
          {onReanalyze && (
            <AIBriefPanel
              imageId={image.id}
              brief={image.ai_brief}
              status={image.ai_brief_status}
              error={image.ai_brief_error}
              onReanalyze={onReanalyze}
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

function AIBriefPanel({
  imageId,
  brief,
  status,
  error,
  onReanalyze,
}: {
  imageId: string;
  brief: ImageAIBrief | null;
  status: ImageAIBriefStatus;
  error: string | null;
  onReanalyze: (imageId: string) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    try {
      await onReanalyze(imageId);
      toast.success("Réanalyse lancée");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Réanalyse impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Sparkles className="w-3.5 h-3.5 text-teal" /> Brief Claude
          <StatusPill status={status} />
        </div>
        <button
          type="button"
          onClick={handle}
          disabled={busy || status === "analyzing"}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground border border-border rounded-md disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />
          {brief ? "Réanalyser" : "Analyser"}
        </button>
      </div>

      <div className="p-3 text-xs space-y-2">
        {status === "analyzing" && !brief && (
          <p className="text-muted-foreground italic">Claude analyse l&apos;image…</p>
        )}
        {status === "error" && (
          <p className="text-wrong">{error || "Analyse échouée"}</p>
        )}
        {brief && (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                Diagnostic probable
              </p>
              <p className="text-foreground font-medium">{brief.diagnostic_likely}</p>
            </div>

            {brief.semiologic_findings.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                  Sémiologie (ce qu&apos;on dit à l&apos;oral)
                </p>
                <ul className="space-y-0.5 text-foreground">
                  {brief.semiologic_findings.map((f, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-teal">·</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {brief.top_3_ddx.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                  Top 3 DDx
                </p>
                <ol className="space-y-1 text-foreground">
                  {brief.top_3_ddx.map((d, i) => (
                    <li key={i}>
                      <span className="font-medium">{i + 1}. {d.dx}</span>
                      <span className="text-muted-foreground"> — {d.distinguishing_feature}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {brief.pitfalls.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                  Pièges
                </p>
                <ul className="space-y-0.5 text-foreground">
                  {brief.pitfalls.map((p, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-amber-500">!</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ImageAIBriefStatus }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-teal/10 text-teal text-[10px] font-semibold">
        ok
      </span>
    );
  }
  if (status === "analyzing" || status === "pending") {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-card border border-border text-muted-foreground text-[10px] font-medium">
        <Loader2 className="w-2.5 h-2.5 animate-spin" /> en cours
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-wrong/10 text-wrong text-[10px] font-semibold">
        <AlertCircle className="w-2.5 h-2.5" /> erreur
      </span>
    );
  }
  return null;
}
