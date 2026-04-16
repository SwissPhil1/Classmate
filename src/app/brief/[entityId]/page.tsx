"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getEntity, getBrief, updateEntity, updateBriefContent, getChildEntities, getEntityImages, createEntityImage, deleteEntityImage, updateEntityImage } from "@/lib/supabase/queries";
import { uploadEntityImage, getImageUrl, deleteStorageImage } from "@/lib/supabase/storage";
import type { Entity, Brief, EntityImage, ImageModality } from "@/lib/types";
import { BriefContent } from "@/components/brief/brief-content";
import { ReferenceTextEditor } from "@/components/brief/reference-text-editor";
import { ImageUpload } from "@/components/ui/image-upload";
import { ImageGallery } from "@/components/ui/image-gallery";
import { ArrowLeft, ExternalLink, ImagePlus, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import Link from "next/link";

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
  const [uploading, setUploading] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);

  const isParent = children.length > 0;

  useEffect(() => {
    async function load() {
      try {
        const e = await getEntity(supabase, entityId);
        setEntity(e);
        setNotes(e.notes || "");
        const [b, ch, imgs] = await Promise.all([
          getBrief(supabase, entityId),
          getChildEntities(supabase, entityId),
          getEntityImages(supabase, entityId),
        ]);
        setBrief(b);
        setChildren(ch);
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

      const res = await fetch("/api/claude/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_name: entity.name,
          entity_type: entity.entity_type,
          chapter: entity.chapter?.name,
          topic: entity.chapter?.topic?.name,
          reference_text: entity.reference_text,
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
      }
    } catch (err) {
      console.error("Brief generation error:", err);
    } finally {
      setGenerating(false);
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

  const handleImageUpload = async (file: File, modality: ImageModality | null, caption: string | null) => {
    if (!entity || !user) return;
    setUploading(true);
    try {
      const storagePath = await uploadEntityImage(supabase, user.id, entity.id, file);
      const record = await createEntityImage(supabase, {
        entity_id: entity.id,
        user_id: user.id,
        storage_path: storagePath,
        caption,
        modality,
        display_order: images.length,
      });
      const url = await getImageUrl(supabase, storagePath);
      setImages((prev) => [...prev, { ...record, url }]);
      setShowImageUpload(false);
      toast.success("Image ajoutée");
    } catch (err: unknown) {
      console.error("Image upload error:", err);
      const message = err instanceof Error ? err.message : String(err);
      // Show actual error for debugging storage policy issues
      if (message.includes("security") || message.includes("policy") || message.includes("Bucket") || message.includes("bucket")) {
        toast.error(`Upload bloqué: ${message}`);
      } else if (message.includes("trop volumineuse") || message.includes("Format")) {
        toast.error(message);
      } else {
        toast.error(`Erreur lors de l'upload: ${message}`);
      }
    } finally {
      setUploading(false);
    }
  };

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

  const handleImageUpdate = async (imageId: string, caption: string | null, modality: ImageModality | null) => {
    try {
      await updateEntityImage(supabase, imageId, { caption, modality });
      setImages((prev) =>
        prev.map((i) => (i.id === imageId ? { ...i, caption, modality } : i))
      );
    } catch (err) {
      console.error("Image update error:", err);
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
                onUpdateCaption={handleImageUpdate}
              />
            </div>
          )}

          {showImageUpload ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Ajouter une image
                </p>
                <button
                  onClick={() => setShowImageUpload(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Annuler
                </button>
              </div>
              <ImageUpload onUpload={handleImageUpload} uploading={uploading} />
            </div>
          ) : (
            <button
              onClick={() => setShowImageUpload(true)}
              className="flex items-center gap-2 text-sm text-teal hover:text-teal-light transition-colors"
            >
              <ImagePlus className="w-4 h-4" />
              {images.length > 0 ? "Ajouter une image" : "Ajouter des images (Aunt Minnie, Radiopaedia...)"}
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
