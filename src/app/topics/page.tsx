"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getTopicHealthGrid } from "@/lib/supabase/queries";
import type { TopicHealth } from "@/lib/types";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const HEALTH_COLORS = {
  red: "bg-wrong",
  yellow: "bg-amber",
  green: "bg-correct",
  empty: "bg-border",
};

export default function TopicsPage() {
  const router = useRouter();
  const { user } = useUser();
  const supabase = createClient();
  const [topics, setTopics] = useState<TopicHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getTopicHealthGrid(supabase, user.id)
      .then(setTopics)
      .finally(() => setLoading(false));
  }, [user]);

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
        {loading ? (
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
          </div>
        )}
      </main>
    </div>
  );
}
