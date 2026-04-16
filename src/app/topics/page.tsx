"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getTopicHealthGrid, createTopic } from "@/lib/supabase/queries";
import type { TopicHealth } from "@/lib/types";
import { ArrowLeft, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const HEALTH_COLORS = {
  red: "bg-wrong",
  yellow: "bg-amber",
  green: "bg-correct",
  empty: "bg-border",
};

export default function TopicsPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const supabase = createClient();
  const [topics, setTopics] = useState<TopicHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    getTopicHealthGrid(supabase, user.id)
      .then(setTopics)
      .finally(() => setLoading(false));
  }, [user]);

  const handleCreateTopic = async () => {
    if (!newTopicName.trim() || !user) return;
    try {
      const { topic } = await createTopic(supabase, newTopicName.trim());
      toast.success(`Thème "${topic.name}" créé`);
      setCreating(false);
      setNewTopicName("");
      router.push(`/topics/${topic.id}`);
    } catch (err) {
      console.error("Create topic error:", err);
      toast.error("Erreur lors de la création du thème");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-2 rounded-lg hover:bg-card transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Thèmes</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {loading || userLoading || !user ? (
          <div className="animate-pulse text-muted-foreground text-center py-12">
            Chargement...
          </div>
        ) : (
          <div className="space-y-3">
            {topics.map(({ topic, chapters, overallHealth }) => {
              const totalEntities = chapters.reduce(
                (s, c) => s + c.active + c.solid + c.archived,
                0
              );
              return (
                <Link
                  key={topic.id}
                  href={`/topics/${topic.id}`}
                  className="block bg-card border border-border rounded-xl p-4 hover:border-teal/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full shrink-0 ${HEALTH_COLORS[overallHealth]}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">
                        {topic.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {chapters.length} chapitres &middot; {totalEntities}{" "}
                        entités &middot;{" "}
                        <span className="capitalize">{topic.exam_component}</span>
                      </p>
                    </div>
                  </div>

                  {/* Chapter health pills */}
                  <div className="flex flex-wrap gap-1.5 mt-3 ml-6">
                    {chapters.map(({ chapter, health }) => (
                      <div
                        key={chapter.id}
                        className={`h-1.5 w-6 rounded-full ${HEALTH_COLORS[health]}`}
                        title={chapter.name}
                      />
                    ))}
                  </div>
                </Link>
              );
            })}

            {/* Create new topic */}
            {creating ? (
              <div className="bg-card border border-teal/30 rounded-xl p-4 space-y-3">
                <input
                  autoFocus
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateTopic();
                    if (e.key === "Escape") { setCreating(false); setNewTopicName(""); }
                  }}
                  placeholder="Nom du thème (ex: Anatomie, Syndromes...)"
                  className="w-full h-12 bg-background border border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-teal"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateTopic}
                    disabled={!newTopicName.trim()}
                    className="flex-1 h-10 flex items-center justify-center gap-2 bg-teal text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    Créer
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewTopicName(""); }}
                    className="h-10 px-4 flex items-center justify-center bg-background border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center justify-center gap-2 h-14 bg-card border border-dashed border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-teal hover:border-teal/50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nouveau thème
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
