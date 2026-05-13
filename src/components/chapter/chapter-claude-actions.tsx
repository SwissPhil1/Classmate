"use client";

import { useState } from "react";
import { Sparkles, Link2, RefreshCw, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getEntities, upsertBrief, updateEntity } from "@/lib/supabase/queries";
import { extractManualSection } from "@/lib/brief-parsing";
import type { Entity } from "@/lib/types";

interface ChapterClaudeActionsProps {
  chapterId: string;
  chapterName: string;
  topicName: string;
  manualContent: string;
  /** Called when generation finished — parent should sync the editor textarea. */
  onGenerated: (markdown: string) => void;
  /** Called after auto-link finished so the parent can refresh entity counts. */
  onLinked?: () => void;
  /** True when the user has unsaved edits — disables regen to avoid divergence. */
  dirty: boolean;
}

const REGEN_CONCURRENCY = 2;

/**
 * Three Claude-powered actions on a chapter manual page:
 *   1. Generate the manual (when empty), in from_knowledge or from_reference mode.
 *   2. Auto-link every entity to its best matching ## Section.
 *   3. Regenerate every entity brief in the chapter, using the manual section
 *      as the dominant reference (the same path that gives Uro-genital its
 *      quality).
 */
export function ChapterClaudeActions({
  chapterId,
  chapterName,
  topicName,
  manualContent,
  onGenerated,
  onLinked,
  dirty,
}: ChapterClaudeActionsProps) {
  const supabase = createClient();
  const { user } = useUser();
  const [genOpen, setGenOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [linking, setLinking] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenProgress, setRegenProgress] = useState({ done: 0, total: 0, errors: 0 });

  const hasManual = manualContent.trim().length > 0;

  const handleGenerate = async (mode: "from_knowledge" | "from_reference", referenceText: string) => {
    setGenerating(true);
    try {
      const res = await fetch("/api/claude/generate-chapter-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_id: chapterId,
          mode,
          ...(mode === "from_reference" ? { reference_text: referenceText } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.manual_content) {
        toast.error(data.error || "Génération impossible");
        return;
      }
      onGenerated(data.manual_content);
      setGenOpen(false);
      toast.success("Manuel généré — pense à enregistrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  };

  const handleAutoLink = async () => {
    if (linking) return;
    setLinking(true);
    try {
      const res = await fetch("/api/claude/auto-link-chapter-entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: chapterId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Auto-link impossible");
        return;
      }
      const linkedN = data.linked?.length ?? 0;
      const unmatchedN = data.unmatched?.length ?? 0;
      if (linkedN === 0 && unmatchedN === 0) {
        toast.message("Aucune entité dans ce chapitre");
      } else if (unmatchedN === 0) {
        toast.success(`${linkedN} entités liées`);
      } else {
        toast.message(`${linkedN} liées · ${unmatchedN} sans correspondance`);
      }
      onLinked?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors du linkage");
    } finally {
      setLinking(false);
    }
  };

  const handleRegenerate = async () => {
    if (!user || regenerating) return;
    if (dirty) {
      toast.error("Enregistre d'abord tes modifications du manuel");
      return;
    }
    if (!confirm(
      "Régénérer tous les briefs du chapitre ? Les briefs précédents seront remplacés (avec snapshot pour undo). Peut prendre plusieurs minutes."
    )) {
      return;
    }

    setRegenerating(true);
    try {
      const entities = await getEntities(supabase, user.id, { chapterId });
      if (entities.length === 0) {
        toast.message("Aucune entité dans ce chapitre");
        return;
      }
      setRegenProgress({ done: 0, total: entities.length, errors: 0 });

      let cursor = 0;
      let done = 0;
      let errors = 0;

      const worker = async () => {
        while (cursor < entities.length) {
          const idx = cursor++;
          const ent = entities[idx];
          try {
            await regenerateOneBrief(supabase, ent, chapterName, topicName, manualContent);
          } catch (err) {
            console.error("regen brief failed for", ent.name, err);
            errors++;
          } finally {
            done++;
            setRegenProgress({ done, total: entities.length, errors });
          }
        }
      };

      const workers: Promise<void>[] = [];
      for (let i = 0; i < Math.min(REGEN_CONCURRENCY, entities.length); i++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      if (errors === 0) {
        toast.success(`${entities.length} briefs régénérés`);
      } else {
        toast.message(`${entities.length - errors}/${entities.length} régénérés · ${errors} échecs`);
      }
    } finally {
      setRegenerating(false);
      setRegenProgress({ done: 0, total: 0, errors: 0 });
    }
  };

  return (
    <>
      <section className="space-y-2">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Actions Claude
        </h2>

        {!hasManual ? (
          <button
            type="button"
            onClick={() => setGenOpen(true)}
            disabled={generating}
            className="w-full h-12 flex items-center justify-center gap-2 bg-teal hover:bg-teal-light text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            Générer le manuel avec Claude
          </button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleAutoLink}
              disabled={linking || dirty}
              className="h-11 flex items-center justify-center gap-2 bg-card border border-teal/30 text-teal rounded-lg text-sm font-medium hover:bg-teal/10 transition-colors disabled:opacity-50"
              title={dirty ? "Enregistre d'abord les modifications" : ""}
            >
              {linking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Lier les entités aux sections
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating || dirty}
              className="h-11 flex items-center justify-center gap-2 bg-card border border-amber/30 text-amber rounded-lg text-sm font-medium hover:bg-amber/10 transition-colors disabled:opacity-50"
              title={dirty ? "Enregistre d'abord les modifications" : ""}
            >
              {regenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {regenProgress.total > 0
                    ? `${regenProgress.done} / ${regenProgress.total}${regenProgress.errors ? ` · ${regenProgress.errors} err` : ""}`
                    : "Régénération…"}
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Régénérer tous les briefs
                </>
              )}
            </button>
          </div>
        )}
      </section>

      {genOpen && (
        <GenerateModal
          chapterName={chapterName}
          generating={generating}
          onGenerate={handleGenerate}
          onClose={() => !generating && setGenOpen(false)}
        />
      )}
    </>
  );
}

function GenerateModal({
  chapterName,
  generating,
  onGenerate,
  onClose,
}: {
  chapterName: string;
  generating: boolean;
  onGenerate: (mode: "from_knowledge" | "from_reference", referenceText: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"from_knowledge" | "from_reference">("from_knowledge");
  const [reference, setReference] = useState("");

  const submit = () => {
    if (mode === "from_reference" && reference.trim().length < 50) {
      toast.error("Colle au moins 50 caractères de référence");
      return;
    }
    void onGenerate(mode, reference.trim());
  };

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            Générer le manuel · {chapterName}
          </h2>
          <button
            onClick={onClose}
            disabled={generating}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Source
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setMode("from_knowledge")}
                className={`px-3 py-3 rounded-lg border text-left transition-colors ${
                  mode === "from_knowledge"
                    ? "bg-teal/10 border-teal text-foreground"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="text-sm font-medium">Connaissances Claude</div>
                <div className="text-[11px] text-muted-foreground">
                  Faits consensuels (Radiopaedia, Crack the Core). Aucun matériel à fournir.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode("from_reference")}
                className={`px-3 py-3 rounded-lg border text-left transition-colors ${
                  mode === "from_reference"
                    ? "bg-teal/10 border-teal text-foreground"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="text-sm font-medium">Texte de référence collé</div>
                <div className="text-[11px] text-muted-foreground">
                  Claude restructure ton texte (PDF copié, notes…). Plus fidèle, moins d&apos;hallucinations.
                </div>
              </button>
            </div>
          </div>

          {mode === "from_reference" && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Texte de référence
              </p>
              <textarea
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Colle ici le texte du chapitre (Crack the Core, Core Radiology, notes personnelles…). Min 50 caractères."
                className="w-full min-h-[200px] bg-background border border-border rounded-lg p-3 text-xs text-foreground font-mono resize-y"
              />
              <p className="text-[10px] text-muted-foreground">
                {reference.length.toLocaleString("fr-CH")} caractères
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Le manuel sera affiché dans l&apos;éditeur — tu pourras le réviser et l&apos;enregistrer manuellement.
          </p>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="flex-1 h-11 bg-card border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={generating}
            className="flex-1 h-11 bg-teal hover:bg-teal-light text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? "Génération…" : "Générer"}
          </button>
        </div>
      </div>
    </div>
  );
}

async function regenerateOneBrief(
  supabase: ReturnType<typeof createClient>,
  entity: Entity,
  chapterName: string,
  topicName: string,
  manualContent: string
): Promise<void> {
  // Mirror the brief page's call shape, with the manual section as the
  // dominant reference when an anchor is set.
  const manualSection = extractManualSection(manualContent, entity.manual_section_anchor);
  const effectiveReference = manualSection ?? entity.reference_text;

  const res = await fetch("/api/claude/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entity_name: entity.name,
      entity_type: entity.entity_type,
      chapter: chapterName,
      topic: topicName,
      reference_text: effectiveReference,
      notes: entity.notes,
      // Don't pass existing_content — we want a fresh brief from the manual.
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  await upsertBrief(supabase, {
    entity_id: entity.id,
    user_id: entity.user_id,
    content: data.content,
    qa_pairs: data.qa_pairs ?? [],
    difficulty_level: entity.difficulty_level,
  });

  // Auto-tag from Claude meta — only if not manually overridden.
  const meta = data.meta as
    | { has_mnemonic?: boolean; mnemonic_name?: string | null; is_critical?: boolean }
    | undefined;
  if (meta) {
    const patch: Partial<Entity> = {};
    if (typeof meta.has_mnemonic === "boolean" && meta.has_mnemonic !== entity.has_mnemonic) {
      patch.has_mnemonic = meta.has_mnemonic;
    }
    if (
      typeof meta.mnemonic_name === "string" &&
      meta.mnemonic_name.trim().length > 0 &&
      meta.mnemonic_name !== entity.mnemonic_name
    ) {
      patch.mnemonic_name = meta.mnemonic_name;
    }
    if (Object.keys(patch).length > 0) {
      await updateEntity(supabase, entity.id, patch);
    }
  }
}
