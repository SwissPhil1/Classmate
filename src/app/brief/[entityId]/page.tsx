"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getEntity, getBrief, updateEntity } from "@/lib/supabase/queries";
import type { Entity, Brief } from "@/lib/types";
import { BriefContent } from "@/components/brief/brief-content";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const e = await getEntity(supabase, entityId);
        setEntity(e);
        setNotes(e.notes || "");
        const b = await getBrief(supabase, entityId);
        setBrief(b);
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
      const res = await fetch("/api/claude/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_name: entity.name,
          entity_type: entity.entity_type,
          chapter: entity.chapter?.name,
          topic: entity.chapter?.topic?.name,
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
        {brief ? (
          <BriefContent
            brief={brief}
            entityType={entity.entity_type}
          />
        ) : (
          <div className="text-center space-y-4 py-12">
            {entity.pre_test_done === false ? (
              <>
                <p className="text-muted-foreground">
                  Le brief sera disponible après le pré-test.
                </p>
                <p className="text-xs text-muted-foreground">
                  Le pré-test sera présenté dans votre prochaine session.
                </p>
              </>
            ) : generating ? (
              <div className="space-y-3">
                <div className="h-4 bg-card animate-pulse rounded w-3/4 mx-auto" />
                <div className="h-4 bg-card animate-pulse rounded w-1/2 mx-auto" />
                <div className="h-4 bg-card animate-pulse rounded w-2/3 mx-auto" />
                <p className="text-sm text-muted-foreground mt-4">
                  Génération en cours...
                </p>
              </div>
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
