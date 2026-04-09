"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import {
  getTopicWithChapters,
  getEntities,
  deleteEntity,
  updateEntity,
} from "@/lib/supabase/queries";
import type { Topic, Entity, EntityType } from "@/lib/types";
import { ArrowLeft, Trash2, Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Link from "next/link";

const STATUS_CONFIG = {
  new: { label: "Nouveau", color: "bg-amber text-white" },
  active: { label: "Actif", color: "bg-teal text-white" },
  solid: { label: "Solide", color: "bg-correct text-white" },
  archived: { label: "Archivé", color: "bg-muted-foreground text-white" },
};

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  single_diagnosis: "Diagnostic",
  ddx_pair: "DDx",
  concept: "Concept",
  protocol: "Protocole",
};

export default function TopicDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const supabase = createClient();
  const topicId = params.topicId as string;

  const [topic, setTopic] = useState<Topic | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  const loadData = async () => {
    if (!user) return;
    try {
      const { topic: t, chapters: ch } = await getTopicWithChapters(supabase, topicId);
      setTopic(t);

      const ents = await getEntities(supabase, user.id);
      const chapterIds = new Set(ch.map((c) => c.id));
      setEntities(ents.filter((e) => chapterIds.has(e.chapter_id)));
    } catch (err) {
      console.error("Topic load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user, topicId]);

  const handleDelete = async (entityId: string) => {
    try {
      await deleteEntity(supabase, entityId);
      setEntities((prev) => prev.filter((e) => e.id !== entityId));
      setDeletingId(null);
      toast.success("Entité supprimée");
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleEdit = async (entityId: string) => {
    if (!editName.trim()) return;
    try {
      await updateEntity(supabase, entityId, { name: editName.trim() } as Partial<Entity>);
      setEntities((prev) =>
        prev.map((e) => (e.id === entityId ? { ...e, name: editName.trim() } : e))
      );
      setEditingId(null);
      toast.success("Entité modifiée");
    } catch (err) {
      console.error("Edit error:", err);
      toast.error("Erreur lors de la modification");
    }
  };

  if (loading || userLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Thème non trouvé</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/topics")}
            className="p-2 rounded-lg hover:bg-card transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground">{topic.name}</h1>
            <p className="text-xs text-muted-foreground">
              {entities.length} entité{entities.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {entities.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-muted-foreground">Aucune entité dans ce thème</p>
            <p className="text-sm text-muted-foreground">
              Utilisez le bouton + sur le tableau de bord pour en ajouter.
            </p>
          </div>
        ) : (
          entities.map((entity) => (
            <div
              key={entity.id}
              className="bg-card border border-border rounded-xl overflow-hidden"
            >
              {editingId === entity.id ? (
                /* Edit mode */
                <div className="px-4 py-3 flex items-center gap-2">
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleEdit(entity.id)}
                    className="h-10 bg-background border-border flex-1"
                  />
                  <button
                    onClick={() => handleEdit(entity.id)}
                    className="p-2 rounded-lg hover:bg-correct/10 text-correct"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="p-2 rounded-lg hover:bg-card text-muted-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : deletingId === entity.id ? (
                /* Delete confirmation */
                <div className="px-4 py-3 flex items-center gap-3">
                  <p className="text-sm text-wrong flex-1">Supprimer cette entité ?</p>
                  <button
                    onClick={() => handleDelete(entity.id)}
                    className="px-3 py-1.5 rounded-lg bg-wrong text-white text-sm font-medium"
                  >
                    Supprimer
                  </button>
                  <button
                    onClick={() => setDeletingId(null)}
                    className="px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-sm"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                /* Normal view */
                <div className="flex items-center">
                  <Link
                    href={`/brief/${entity.id}`}
                    className="flex-1 px-4 py-3 flex items-center gap-3 hover:bg-background/50 transition-colors min-w-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {entity.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {ENTITY_TYPE_LABELS[entity.entity_type]}
                        </span>
                        {entity.next_test_date && (
                          <span className="text-xs text-muted-foreground">
                            &middot; Prochain test: {new Date(entity.next_test_date).toLocaleDateString("fr-CH", { day: "numeric", month: "short" })}
                          </span>
                        )}
                        {entity.reference_text && (
                          <span className="text-xs text-teal">&middot; Réf.</span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_CONFIG[entity.status].color}`}
                    >
                      {STATUS_CONFIG[entity.status].label}
                    </span>
                  </Link>
                  <div className="flex items-center border-l border-border">
                    <button
                      onClick={() => {
                        setEditingId(entity.id);
                        setEditName(entity.name);
                      }}
                      className="p-3 hover:bg-background/50 transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeletingId(entity.id)}
                      className="p-3 hover:bg-wrong/10 transition-colors text-muted-foreground hover:text-wrong"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {entities.length > 0 && (
          <Button
            onClick={() =>
              router.push(`/session?type=topic_study&topic=${topicId}`)
            }
            className="w-full h-14 bg-teal hover:bg-teal-light text-white font-semibold"
          >
            Étudier ce thème
          </Button>
        )}
      </main>
    </div>
  );
}
