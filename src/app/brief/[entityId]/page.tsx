"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getEntity, getBrief, updateEntity, updateBriefContent, getChildEntities, getEntityImages, deleteEntityImage, updateEntityImage, setCoverImage, setEntityPriority, createEntityEvent, getEntityEvents, restoreBriefPrevious, type EntityImagePatch } from "@/lib/supabase/queries";
import { extractManualSection } from "@/lib/brief-parsing";
import { ManualSectionLink } from "@/components/brief/manual-section-link";
import { ClaudeDiffPreview } from "@/components/brief/claude-diff-preview";
import { getImageUrl, deleteStorageImage } from "@/lib/supabase/storage";
import type { Entity, Brief, EntityImage, EntityEvent } from "@/lib/types";
import { BriefContent } from "@/components/brief/brief-content";
import { ReferenceTextEditor } from "@/components/brief/reference-text-editor";
import { ImageUpload } from "@/components/ui/image-upload";
import { ImageGallery } from "@/components/ui/image-gallery";
import { useImageUpload } from "@/hooks/use-image-upload";
import { ArrowLeft, ExternalLink, ImagePlus, ChevronDown, ChevronRight, Zap, Sparkles, History, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import Link from "next/link";

function eventKindLabel(kind: EntityEvent["kind"]): string {
  switch (kind) {
    case "reference_added":
      return "Référence ajoutée";
    case "claude_regenerated":
      return "Brief régénéré (Claude)";
    case "claude_merged":
      return "Brief intégré (Claude merge)";
    case "anchor_linked":
      return "Lié à une section du manuel";
    case "anchor_unlinked":
      return "Lien à la section retiré";
    case "brief_reverted":
      return "Version précédente restaurée";
    default:
      return kind;
  }
}

export default function BriefPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const supabase = createClient();
  const entityId = params.entityId as string;

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  const [entity, setEntity] = useState<Entity | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [children, setChildren] = useState<Entity[]>([]);
  const [images, setImages] = useState<EntityImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [integrating, setIntegrating] = useState(false);
  const [pendingMerge, setPendingMerge] = useState<{ before: string; after: string; changedRatio: number } | null>(null);
  const [events, setEvents] = useState<EntityEvent[]>([]);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  const isParent = children.length > 0;

  useEffect(() => {
    async function load() {
      try {
        const e = await getEntity(supabase, entityId);
        setEntity(e);
        setNotes(e.notes || "");
        const [b, ch, imgs, evts] = await Promise.all([
          getBrief(supabase, entityId),
          getChildEntities(supabase, entityId),
          getEntityImages(supabase, entityId),
          getEntityEvents(supabase, entityId),
        ]);
        setBrief(b);
        setChildren(ch);
        setEvents(evts);
        setCanUndo(!!b?.content_previous);
        // Attach signed URLs to images (works with private buckets)
        const imgsWithUrls = await Promise.all(
          imgs.map(async (img) => ({
            ...img,
            url: await getImageUrl(supabase, img.storage_path),
          }))
        );
        setImages(imgsWithUrls);
      } catch (err) {
        console.error("Brief load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [entityId]);

  const handleGenerate = async () => {
    if (!entity) return;
    setGenerating(true);
    try {
      // For parent entities, pass synthesis data with children info
      const synthData = isParent
        ? {
            is_synthesis: true,
            children_names: children.map((c) => c.name),
            children_references: children.map((c) => c.reference_text || ""),
          }
        : {};

      // Prefer the linked chapter-manual section over the legacy
      // per-entity reference_text when both exist. This is the integration
      // point for the chapter-manual workflow (itération 6).
      const manualSection = extractManualSection(
        entity.chapter?.manual_content,
        entity.manual_section_anchor
      );
      const effectiveReference = manualSection ?? entity.reference_text;

      const res = await fetch("/api/claude/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_name: entity.name,
          entity_type: entity.entity_type,
          chapter: entity.chapter?.name,
          topic: entity.chapter?.topic?.name,
          reference_text: effectiveReference,
          notes: entity.notes,
          // Pass existing content so Claude preserves user edits
          existing_content: brief?.content || undefined,
          ...synthData,
        }),
      });
      const data = await res.json();
      if (!data.error) {
        const { upsertBrief } = await import("@/lib/supabase/queries");
        const saved = await upsertBrief(supabase, {
          entity_id: entity.id,
          content: data.content,
          qa_pairs: data.qa_pairs,
          difficulty_level: entity.difficulty_level,
        });
        setBrief(saved);

        // Auto-tag from Claude meta — only overwrite if user hasn't set a manual priority
        const meta = data.meta as { has_mnemonic?: boolean; mnemonic_name?: string | null; is_critical?: boolean } | undefined;
        if (meta) {
          const entityPatch: Partial<Entity> = {};
          if (typeof meta.has_mnemonic === "boolean" && meta.has_mnemonic !== entity.has_mnemonic) {
            entityPatch.has_mnemonic = meta.has_mnemonic;
          }
          if (meta.mnemonic_name !== undefined && meta.mnemonic_name !== entity.mnemonic_name) {
            entityPatch.mnemonic_name = meta.mnemonic_name ?? null;
          }
          const shouldBeVital = meta.has_mnemonic === true || meta.is_critical === true;
          const canAutoSet = entity.priority_source !== "manual";
          if (canAutoSet && shouldBeVital && entity.priority !== "vital") {
            entityPatch.priority = "vital";
            entityPatch.priority_source = "auto";
          }
          if (Object.keys(entityPatch).length > 0) {
            await updateEntity(supabase, entity.id, entityPatch);
            setEntity({ ...entity, ...entityPatch });
          }
        }
      }
    } catch (err) {
      console.error("Brief generation error:", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleTogglePriority = async () => {
    if (!entity) return;
    const next = entity.priority === "vital" ? "normal" : "vital";
    try {
      await setEntityPriority(supabase, entity.id, next, "manual");
      setEntity({ ...entity, priority: next, priority_source: "manual" });
      toast.success(next === "vital" ? "Marqué comme vital" : "Priorité normale");
    } catch (err) {
      console.error("Priority toggle error:", err);
      toast.error("Impossible de mettre à jour la priorité");
    }
  };

  const handleIntegrate = async () => {
    if (!entity || !brief || integrating) return;
    const manualSection = extractManualSection(
      entity.chapter?.manual_content,
      entity.manual_section_anchor
    );
    const newMaterial = manualSection ?? entity.reference_text ?? "";
    if (!newMaterial.trim()) {
      toast.error("Aucune matière à intégrer (ni section de manuel liée, ni reference_text)");
      return;
    }
    setIntegrating(true);
    try {
      const res = await fetch("/api/claude/merge-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existing_content: brief.content,
          new_material: newMaterial,
          entity_name: entity.name,
          source_label: entity.manual_section_anchor ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "Merge impossible");
        return;
      }
      setPendingMerge({
        before: brief.content,
        after: data.merged_content,
        changedRatio: data.changed_ratio ?? 0,
      });
    } catch (err) {
      console.error("Integrate error:", err);
      toast.error("Merge impossible");
    } finally {
      setIntegrating(false);
    }
  };

  const handleAcceptMerge = async (finalContent: string) => {
    if (!entity || !brief || !user || !pendingMerge) return;
    try {
      // Store previous content for undo, then update.
      const { error } = await supabase
        .from("briefs")
        .update({
          content: finalContent,
          content_previous: brief.content,
        })
        .eq("entity_id", entity.id);
      if (error) throw error;
      setBrief({ ...brief, content: finalContent, content_previous: brief.content });
      setCanUndo(true);
      await createEntityEvent(supabase, {
        entity_id: entity.id,
        user_id: user.id,
        kind: "claude_merged",
        source_label: entity.manual_section_anchor,
        diff_summary: `${Math.round(pendingMerge.changedRatio * 100)}% modifié`,
      });
      setEvents(await getEntityEvents(supabase, entity.id));
      setPendingMerge(null);
      toast.success("Intégré · Annuler disponible ci-dessous");
    } catch (err) {
      console.error("Accept merge error:", err);
      toast.error("Sauvegarde impossible");
    }
  };

  const handleRejectMerge = () => {
    setPendingMerge(null);
  };

  const handleUndo = async () => {
    if (!entity || !user || !canUndo) return;
    try {
      const { content, content_previous } = await restoreBriefPrevious(supabase, entity.id);
      setBrief((prev) => (prev ? { ...prev, content, content_previous } : prev));
      setCanUndo(!!content_previous);
      await createEntityEvent(supabase, {
        entity_id: entity.id,
        user_id: user.id,
        kind: "brief_reverted",
      });
      setEvents(await getEntityEvents(supabase, entity.id));
      toast.success("Version précédente restaurée");
    } catch (err) {
      console.error("Undo error:", err);
      toast.error(err instanceof Error ? err.message : "Annulation impossible");
    }
  };

  const handleSaveNotes = async () => {
    if (!entity || notes === (entity.notes || "")) return;
    setNotesSaving(true);
    try {
      await updateEntity(supabase, entity.id, { notes } as Partial<Entity>);
      setEntity({ ...entity, notes });
    } catch (err) {
      console.error("Save notes error:", err);
    } finally {
      setNotesSaving(false);
    }
  };

  const handleImageSaved = useCallback((image: EntityImage) => {
    setImages((prev) => [...prev, image]);
    toast.success("Image ajoutée");
  }, []);

  const handleImageAnalyzed = useCallback(
    (
      imageId: string,
      patch: { ai_brief: import("@/lib/types").ImageAIBrief | null; ai_brief_status: import("@/lib/types").ImageAIBriefStatus; ai_brief_generated_at: string | null }
    ) => {
      setImages((prev) =>
        prev.map((i) =>
          i.id === imageId
            ? {
                ...i,
                ai_brief: patch.ai_brief,
                ai_brief_status: patch.ai_brief_status,
                ai_brief_generated_at: patch.ai_brief_generated_at,
              }
            : i
        )
      );
    },
    []
  );

  const handleImageReanalyze = useCallback(
    async (imageId: string) => {
      // Optimistic UI: flip the badge to "analyzing" before the round-trip.
      setImages((prev) =>
        prev.map((i) =>
          i.id === imageId ? { ...i, ai_brief_status: "analyzing" as const, ai_brief_error: null } : i
        )
      );
      const res = await fetch("/api/claude/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_id: imageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        handleImageAnalyzed(imageId, {
          ai_brief: null,
          ai_brief_status: "error",
          ai_brief_generated_at: null,
        });
        throw new Error(data.error || "Réanalyse impossible");
      }
      handleImageAnalyzed(imageId, {
        ai_brief: data.ai_brief ?? null,
        ai_brief_status: data.ai_brief_status ?? "done",
        ai_brief_generated_at: data.ai_brief_generated_at ?? null,
      });
    },
    [handleImageAnalyzed]
  );

  // Single uploader instance for both the drop-zone UI and the page-level
  // paste listener — keeps progress state shared.
  const uploader = useImageUpload({
    userId: user?.id ?? "",
    entityId,
    baseDisplayOrder: images.length,
    onSaved: handleImageSaved,
    onAnalyzed: handleImageAnalyzed,
  });

  // Page-level paste listener — works anywhere on /brief/[entityId], even when
  // the upload drop-zone is hidden. Auto-opens the panel so the user sees
  // progress feedback for the pasted images.
  useEffect(() => {
    if (!user) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length === 0) return;
      e.preventDefault();
      setShowImageUpload(true);
      void uploader.upload(files, null);
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [user, uploader]);

  const handleImageDelete = async (imageId: string) => {
    const image = images.find((i) => i.id === imageId);
    if (!image) return;
    try {
      await deleteStorageImage(supabase, image.storage_path);
      await deleteEntityImage(supabase, imageId);
      setImages((prev) => prev.filter((i) => i.id !== imageId));
      toast.success("Image supprimée");
    } catch (err) {
      console.error("Image delete error:", err);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleImageSave = async (imageId: string, patch: EntityImagePatch) => {
    try {
      await updateEntityImage(supabase, imageId, patch);
      setImages((prev) =>
        prev.map((i) => (i.id === imageId ? { ...i, ...patch } as EntityImage : i))
      );
    } catch (err) {
      console.error("Image update error:", err);
      toast.error("Erreur lors de la sauvegarde");
    }
  };

  const handleImageSetCover = async (imageId: string) => {
    if (!entity) return;
    try {
      await setCoverImage(supabase, entity.id, imageId);
      setImages((prev) =>
        prev.map((i) => ({ ...i, is_cover: i.id === imageId }))
      );
      toast.success("Cover mise à jour");
    } catch (err) {
      console.error("Set cover error:", err);
      toast.error("Erreur lors du changement de cover");
    }
  };

  const handleImageReorder = async (imageId: string, direction: -1 | 1) => {
    const idx = images.findIndex((i) => i.id === imageId);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= images.length) return;
    const a = images[idx];
    const b = images[swapIdx];
    // Swap display_order values. Use a temporary unique value to avoid any
    // future unique-constraint-on-(entity_id, display_order) collision.
    const reordered = [...images];
    reordered[idx] = { ...b, display_order: a.display_order };
    reordered[swapIdx] = { ...a, display_order: b.display_order };
    setImages(reordered);
    try {
      await updateEntityImage(supabase, a.id, { display_order: b.display_order });
      await updateEntityImage(supabase, b.id, { display_order: a.display_order });
    } catch (err) {
      console.error("Reorder error:", err);
      toast.error("Erreur lors du déplacement");
      setImages(images);
    }
  };

  const radiopaediaUrl = entity
    ? `https://radiopaedia.org/search?utf8=%E2%9C%93&q=${encodeURIComponent(entity.name)}&scope=all`
    : "";

  if (loading || userLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Entité non trouvée</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-card transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">
              {entity.name}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              {entity.chapter?.topic && (
                <span className="text-xs bg-teal/10 text-teal px-2 py-0.5 rounded-full">
                  {entity.chapter.topic.name}
                </span>
              )}
              {entity.chapter && (
                <span className="text-xs bg-card text-muted-foreground px-2 py-0.5 rounded-full border border-border">
                  {entity.chapter.name}
                </span>
              )}
              {entity.source && (
                <span className="text-xs text-muted-foreground">
                  {entity.source.name}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleTogglePriority}
            aria-pressed={entity.priority === "vital"}
            aria-label={entity.priority === "vital" ? "Retirer la priorité vitale" : "Marquer comme vital"}
            title={entity.priority === "vital" ? "Vital (priorité élevée)" : "Marquer comme vital"}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${
              entity.priority === "vital"
                ? "bg-amber/15 text-amber border border-amber/30"
                : "bg-card text-muted-foreground border border-border hover:border-amber/40 hover:text-amber"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Vital
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Parent group info */}
        {isParent && (
          <div className="mb-6 bg-teal/5 border border-teal/20 rounded-xl p-4 space-y-2">
            <p className="text-sm font-medium text-teal">
              Groupe de synthèse — {children.length} sous-entité{children.length !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {children.map((child) => (
                <Link
                  key={child.id}
                  href={`/brief/${child.id}`}
                  className="text-xs bg-card border border-border rounded-full px-2.5 py-1 text-foreground hover:border-teal/50 transition-colors"
                >
                  {child.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Images section */}
        <div className="mb-6 space-y-3">
          {images.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Images ({images.length})
              </p>
              <ImageGallery
                images={images}
                onDelete={handleImageDelete}
                onSave={handleImageSave}
                onSetCover={handleImageSetCover}
                onReorder={handleImageReorder}
                onReanalyze={handleImageReanalyze}
              />
            </div>
          )}

          {showImageUpload && user ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Ajouter des images
                </p>
                <button
                  onClick={() => setShowImageUpload(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Fermer
                </button>
              </div>
              <ImageUpload
                upload={uploader.upload}
                progress={uploader.progress}
                clearCompleted={uploader.clearCompleted}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowImageUpload(true)}
              className="flex items-center gap-2 text-sm text-teal hover:text-teal-light transition-colors"
            >
              <ImagePlus className="w-4 h-4" />
              {images.length > 0 ? "Ajouter d'autres images" : "Ajouter des images (Aunt Minnie, Radiopaedia...)"}
            </button>
          )}
        </div>

        {brief ? (
          <>
            <BriefContent
              brief={brief}
              entityType={entity.entity_type}
              onContentChange={async (newContent) => {
                try {
                  await updateBriefContent(supabase, entityId, newContent);
                  setBrief({ ...brief, content: newContent });
                } catch (err) {
                  console.error("Brief update error:", err);
                }
              }}
              onRewriteMnemonic={async (feedback) => {
                try {
                  const res = await fetch("/api/claude/rewrite-mnemonic", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ entity_id: entityId, user_feedback: feedback }),
                  });
                  const data = await res.json();
                  if (!res.ok || !data.content) {
                    toast.error(data.error || "Réécriture impossible");
                    return null;
                  }
                  setBrief({ ...brief, content: data.content });
                  toast.success("Mnémonique réécrite");
                  return data.content as string;
                } catch (err) {
                  console.error("Rewrite mnemonic error:", err);
                  toast.error("Réécriture indisponible");
                  return null;
                }
              }}
            />
            {/* Regenerate button */}
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="text-xs text-muted-foreground hover:text-teal transition-colors disabled:opacity-50"
              >
                {generating
                  ? "Régénération en cours..."
                  : isParent
                    ? "Régénérer le brief de synthèse (vos modifications seront préservées)"
                    : "Régénérer le brief (vos modifications seront préservées)"}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center space-y-4 py-12">
            {generating ? (
              <div className="space-y-3">
                <div className="h-4 bg-card animate-pulse rounded w-3/4 mx-auto" />
                <div className="h-4 bg-card animate-pulse rounded w-1/2 mx-auto" />
                <div className="h-4 bg-card animate-pulse rounded w-2/3 mx-auto" />
                <p className="text-sm text-muted-foreground mt-4">
                  {isParent ? "Génération du brief de synthèse..." : "Génération en cours..."}
                </p>
              </div>
            ) : isParent ? (
              <>
                <p className="text-muted-foreground">
                  Aucun brief de synthèse disponible.
                </p>
                <p className="text-xs text-muted-foreground">
                  Le brief de synthèse comparera les {children.length} sous-entités de ce groupe.
                </p>
                <Button
                  onClick={handleGenerate}
                  className="bg-teal hover:bg-teal-light text-white"
                >
                  Générer le brief de synthèse
                </Button>
              </>
            ) : entity.pre_test_done === false ? (
              <>
                <p className="text-muted-foreground">
                  Le brief sera disponible après le pré-test.
                </p>
                <p className="text-xs text-muted-foreground">
                  Le pré-test sera présenté dans votre prochaine session.
                </p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Aucun brief disponible pour cette entité.
                </p>
                <Button
                  onClick={handleGenerate}
                  className="bg-teal hover:bg-teal-light text-white"
                >
                  Générer le brief
                </Button>
              </>
            )}
          </div>
        )}

        {/* Chapter-manual section linkage — dominant reference when set */}
        {entity.chapter && (
          <div className="mt-6">
            <ManualSectionLink
              chapterId={entity.chapter.id}
              chapterName={entity.chapter.name}
              manualContent={entity.chapter.manual_content}
              currentAnchor={entity.manual_section_anchor}
              onChange={async (anchor) => {
                await updateEntity(supabase, entity.id, {
                  manual_section_anchor: anchor,
                } as Partial<Entity>);
                setEntity({ ...entity, manual_section_anchor: anchor });
                if (user) {
                  await createEntityEvent(supabase, {
                    entity_id: entity.id,
                    user_id: user.id,
                    kind: anchor ? "anchor_linked" : "anchor_unlinked",
                    source_label: anchor,
                  });
                  setEvents(await getEntityEvents(supabase, entity.id));
                }
              }}
            />
          </div>
        )}

        {/* Claude integrate — non-destructive merge of linked section / reference_text */}
        {brief && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Button
              onClick={handleIntegrate}
              disabled={integrating || !!pendingMerge}
              className="bg-teal/10 border border-teal/30 text-teal hover:bg-teal/20"
              variant="ghost"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              {integrating ? "Analyse en cours…" : "Intégrer avec Claude (non-destructif)"}
            </Button>
            {canUndo && (
              <Button
                onClick={handleUndo}
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
              >
                <Undo2 className="w-4 h-4 mr-1.5" />
                Annuler la dernière modification
              </Button>
            )}
          </div>
        )}

        {/* Diff preview after a merge proposal */}
        {pendingMerge && (
          <div className="mt-4">
            <ClaudeDiffPreview
              before={pendingMerge.before}
              after={pendingMerge.after}
              changedRatio={pendingMerge.changedRatio}
              onAccept={handleAcceptMerge}
              onReject={handleRejectMerge}
            />
          </div>
        )}

        {/* Activity log — accordion */}
        {events.length > 0 && (
          <div className="mt-6 bg-card border border-border rounded-xl">
            <button
              onClick={() => setEventsOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-foreground hover:bg-background/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <History className="w-4 h-4 text-muted-foreground" />
                Historique ({events.length})
              </span>
              {eventsOpen ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            {eventsOpen && (
              <ul className="border-t border-border divide-y divide-border">
                {events.map((e) => (
                  <li key={e.id} className="px-4 py-2 text-xs">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-foreground">
                        {eventKindLabel(e.kind)}
                        {e.source_label && (
                          <span className="text-muted-foreground"> · {e.source_label}</span>
                        )}
                        {e.diff_summary && (
                          <span className="text-muted-foreground"> · {e.diff_summary}</span>
                        )}
                      </span>
                      <span className="text-muted-foreground flex-shrink-0">
                        {new Date(e.created_at).toLocaleString("fr-CH", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Reference text editor */}
        <ReferenceTextEditor
          entityName={entity.name}
          referenceText={entity.reference_text}
          onSave={async (text) => {
            await updateEntity(supabase, entity.id, { reference_text: text } as Partial<Entity>);
            setEntity({ ...entity, reference_text: text });
          }}
        />

        {/* Notes section */}
        <div className="mt-8 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Mes notes / corrections
          </h2>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleSaveNotes}
            placeholder="Ajouter des notes, corrections ou observations personnelles..."
            className="min-h-[100px] bg-card border-border resize-none text-sm"
            rows={4}
          />
          {notesSaving && (
            <p className="text-xs text-muted-foreground">Sauvegarde...</p>
          )}
        </div>

        {/* Bottom actions */}
        <div className="mt-8 space-y-3">
          <Link
            href={radiopaediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full h-12 bg-card border border-border rounded-xl text-sm text-foreground hover:border-teal/50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Voir sur Radiopaedia
          </Link>

          <Button
            onClick={() =>
              router.push(
                `/session?type=short&entity=${entity.id}`
              )
            }
            className="w-full h-14 bg-teal hover:bg-teal-light text-white font-semibold"
          >
            Me tester maintenant
          </Button>
        </div>
      </main>
    </div>
  );
}
