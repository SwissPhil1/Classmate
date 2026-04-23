"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import type { Chapter, Topic } from "@/lib/types";
import { parseSections } from "@/lib/brief-parsing";

export default function ChapterManualPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const supabase = createClient();
  const chapterId = params.chapterId as string;

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data: ch, error: chErr } = await supabase
          .from("chapters")
          .select("*, topic:topics(*)")
          .eq("id", chapterId)
          .single();
        if (chErr) throw chErr;
        setChapter(ch as Chapter);
        setTopic((ch as Chapter).topic ?? null);
        setContent((ch as Chapter).manual_content ?? "");
      } catch (err) {
        console.error("Load chapter error:", err);
        toast.error("Chapitre introuvable");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, chapterId, supabase]);

  const sections = useMemo(() => {
    if (!content.trim()) return [];
    return parseSections(content).filter((s) => s.title && s.content.trim().length > 0);
  }, [content]);

  const handleSave = async () => {
    if (!chapter || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("chapters")
        .update({ manual_content: content || null })
        .eq("id", chapter.id);
      if (error) throw error;
      setDirty(false);
      toast.success(`Manuel enregistré · ${sections.length} section${sections.length > 1 ? "s" : ""}`);
    } catch (err) {
      console.error("Save manual error:", err);
      toast.error("Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  if (loading || userLoading) {
    return (
      <div className="min-h-screen bg-background p-6 text-muted-foreground animate-pulse">
        Chargement…
      </div>
    );
  }
  if (!chapter) {
    return (
      <div className="min-h-screen bg-background p-6 text-wrong">
        Chapitre introuvable.
      </div>
    );
  }

  const charCount = content.length;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push(topic ? `/topics/${topic.id}` : "/topics")}
            className="p-2 rounded-lg hover:bg-card transition-colors"
            aria-label="Retour"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">
              {topic?.name ?? "Chapitre"}
            </p>
            <h1 className="text-lg font-bold text-foreground truncate">
              Manuel · {chapter.name}
            </h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 h-9 px-3 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-light transition-colors disabled:opacity-40"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Enregistrer
              </>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <section className="space-y-2">
          <div className="flex items-start gap-3 bg-card border border-teal/20 rounded-xl p-4">
            <BookOpen className="w-5 h-5 text-teal flex-shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              Colle ici une référence long-format du chapitre (doc Claude desktop,
              extrait de textbook, notes consolidées). Utilise <code className="text-foreground">## Titre</code> pour
              séparer les sections — chaque section devient une ancre qu'une
              entité peut référencer pour ses briefs et son drill.
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Markdown</span>
            <span>
              {wordCount.toLocaleString("fr-CH")} mots · {charCount.toLocaleString("fr-CH")} car. ·{" "}
              {sections.length} section{sections.length > 1 ? "s" : ""}
            </span>
          </div>
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            placeholder={"## Rein\n\nContenu de la section rein…\n\n## Voie excrétrice\n\n…"}
            className="w-full min-h-[60vh] bg-card border border-border rounded-xl p-4 text-sm text-foreground font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-teal/30"
          />
        </section>

        {sections.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Sections détectées ({sections.length})
            </h2>
            <ul className="bg-card border border-border rounded-xl divide-y divide-border">
              {sections.map((s, i) => (
                <li key={i} className="px-4 py-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-foreground font-medium truncate">
                      {s.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {s.content.length.toLocaleString("fr-CH")} car.
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">
              Une entité pourra être liée à l'une de ces sections depuis sa page
              de brief (prochaine itération).
            </p>
          </section>
        )}

        {chapter.manual_content && !dirty && (
          <section className="pt-4">
            <Link
              href={`/chapters/${chapter.id}/read`}
              className="inline-flex items-center gap-1.5 text-sm text-teal hover:text-teal-light transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Lire en pleine largeur
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
