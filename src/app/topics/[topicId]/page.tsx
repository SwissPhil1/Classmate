"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import {
  getTopicWithChapters,
  getEntities,
} from "@/lib/supabase/queries";
import type { Topic, Chapter, Entity } from "@/lib/types";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const STATUS_CONFIG = {
  new: { label: "Nouveau", color: "bg-amber text-white" },
  active: { label: "Actif", color: "bg-teal text-white" },
  solid: { label: "Solide", color: "bg-correct text-white" },
  archived: { label: "Archivé", color: "bg-archived text-white" },
};

export default function TopicDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const supabase = createClient();
  const topicId = params.topicId as string;

  const [topic, setTopic] = useState<Topic | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const { topic: t, chapters: ch } = await getTopicWithChapters(
          supabase,
          topicId
        );
        setTopic(t);
        setChapters(ch);

        const ents = await getEntities(supabase, user!.id);
        // Filter to entities in this topic's chapters
        const chapterIds = new Set(ch.map((c) => c.id));
        setEntities(ents.filter((e) => chapterIds.has(e.chapter_id)));
      } catch (err) {
        console.error("Topic load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, topicId]);

  if (loading) {
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
          <div>
            <h1 className="text-lg font-bold text-foreground">{topic.name}</h1>
            <p className="text-xs text-muted-foreground capitalize">
              {topic.exam_component}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {chapters.map((chapter) => {
          const chapterEntities = entities.filter(
            (e) => e.chapter_id === chapter.id
          );
          const active = chapterEntities.filter(
            (e) => e.status === "active" || e.status === "new"
          ).length;
          const solid = chapterEntities.filter(
            (e) => e.status === "solid"
          ).length;
          const archived = chapterEntities.filter(
            (e) => e.status === "archived"
          ).length;
          const isExpanded = expandedChapter === chapter.id;

          return (
            <div
              key={chapter.id}
              className="bg-card border border-border rounded-xl overflow-hidden"
            >
              <button
                onClick={() =>
                  setExpandedChapter(isExpanded ? null : chapter.id)
                }
                className="w-full text-left px-4 py-3 flex items-center justify-between"
              >
                <span className="font-medium text-foreground text-sm">
                  {chapter.name}
                </span>
                <div className="flex items-center gap-2">
                  {active > 0 && (
                    <span className="text-xs bg-teal/10 text-teal px-2 py-0.5 rounded-full">
                      {active}
                    </span>
                  )}
                  {solid > 0 && (
                    <span className="text-xs bg-correct/10 text-correct px-2 py-0.5 rounded-full">
                      {solid}
                    </span>
                  )}
                  {archived > 0 && (
                    <span className="text-xs bg-archived/10 text-archived px-2 py-0.5 rounded-full">
                      {archived}
                    </span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border">
                  {chapterEntities.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      Aucune entité
                    </p>
                  ) : (
                    chapterEntities.map((entity) => (
                      <Link
                        key={entity.id}
                        href={`/brief/${entity.id}`}
                        className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 hover:bg-background transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm text-foreground truncate">
                            {entity.name}
                          </span>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_CONFIG[entity.status].color}`}
                        >
                          {STATUS_CONFIG[entity.status].label}
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

        <Button
          onClick={() =>
            router.push(`/session?type=topic_study&topic=${topicId}`)
          }
          className="w-full h-14 bg-teal hover:bg-teal-light text-white font-semibold"
        >
          Étudier ce thème
        </Button>
      </main>
    </div>
  );
}
