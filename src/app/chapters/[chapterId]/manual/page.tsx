"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, BookOpen, Loader2, Sparkles, Check, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { createEntity, getSources, getEntities } from "@/lib/supabase/queries";
import type { Chapter, Topic, EntityType, Source } from "@/lib/types";
import { parseSections } from "@/lib/brief-parsing";
import { ChapterClaudeActions } from "@/components/chapter/chapter-claude-actions";

interface ProposedEntity {
  name: string;
  section_anchor: string;
  entity_type: EntityType;
  reason?: string;
  selected: boolean;
  duplicate: boolean;
}

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
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [extracting, setExtracting] = useState(false);
  const [proposals, setProposals] = useState<ProposedEntity[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [appendText, setAppendText] = useState("");
  const [appendSource, setAppendSource] = useState("");
  const [appending, setAppending] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [chapterRes, sourcesList] = await Promise.all([
          supabase
            .from("chapters")
            .select("*, topic:topics(*)")
            .eq("id", chapterId)
            .single(),
          getSources(supabase),
        ]);
        if (chapterRes.error) throw chapterRes.error;
        const ch = chapterRes.data as Chapter;
        setChapter(ch);
        setTopic(ch.topic ?? null);
        setContent(ch.manual_content ?? "");
        setSources(sourcesList);
        if (sourcesList.length > 0) setSelectedSourceId(sourcesList[0].id);
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
      setConfirmingReplace(false);
      toast.success(`Manuel enregistré · ${sections.length} section${sections.length > 1 ? "s" : ""}`);
    } catch (err) {
      console.error("Save manual error:", err);
      toast.error("Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const handleAppend = async () => {
    if (!chapter || appending) return;
    const trimmed = appendText.trim();
    if (!trimmed) {
      toast.error("Rien à ajouter");
      return;
    }
    const sourceLabel = appendSource.trim() || "Source non précisée";
    const today = new Date().toISOString().slice(0, 10);
    const banner = `\n\n## Source : ${sourceLabel} — ${today}\n\n`;
    const existing = content.trim();
    const newContent = existing ? existing + banner + trimmed : `## Source : ${sourceLabel} — ${today}\n\n${trimmed}`;
    setAppending(true);
    try {
      const { error } = await supabase
        .from("chapters")
        .update({ manual_content: newContent })
        .eq("id", chapter.id);
      if (error) throw error;
      setContent(newContent);
      setAppendText("");
      toast.success(`Ajouté · source "${sourceLabel}"`);
    } catch (err) {
      console.error("Append source error:", err);
      toast.error("Ajout impossible");
    } finally {
      setAppending(false);
    }
  };

  const handleExtract = async () => {
    if (!chapter || !user || extracting || !content.trim()) return;
    if (dirty) {
      toast.message("Enregistre le manuel avant d'extraire les entités");
      return;
    }
    setExtracting(true);
    try {
      const anchors = sections.map((s) => s.title);
      const res = await fetch("/api/claude/extract-entities-from-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manual_content: content,
          chapter_name: chapter.name,
          topic_name: topic?.name,
          section_anchors: anchors,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "Extraction impossible");
        return;
      }
      // Flag duplicates against existing entities for this user+chapter
      const existing = await getEntities(supabase, user.id);
      const existingNames = new Set(
        existing
          .filter((e) => e.chapter_id === chapter.id)
          .map((e) => e.name.trim().toLowerCase())
      );
      const proposed: ProposedEntity[] = (data.entities as ProposedEntity[]).map((e) => {
        const duplicate = existingNames.has(e.name.trim().toLowerCase());
        return { ...e, duplicate, selected: !duplicate };
      });
      setProposals(proposed);
      toast.success(`${proposed.length} entité${proposed.length > 1 ? "s" : ""} proposée${proposed.length > 1 ? "s" : ""}`);
    } catch (err) {
      console.error("Extract entities error:", err);
      toast.error("Extraction impossible");
    } finally {
      setExtracting(false);
    }
  };

  const handleBulkCreate = async () => {
    if (!chapter || !user || !proposals || creating) return;
    if (!selectedSourceId) {
      toast.error("Sélectionne une source");
      return;
    }
    const toCreate = proposals.filter((p) => p.selected && !p.duplicate);
    if (toCreate.length === 0) {
      toast.message("Rien à créer");
      return;
    }
    setCreating(true);
    let created = 0;
    try {
      for (const p of toCreate) {
        const entity = await createEntity(supabase, {
          user_id: user.id,
          chapter_id: chapter.id,
          name: p.name,
          entity_type: p.entity_type,
          source_id: selectedSourceId,
        });
        // Second call to set the manual_section_anchor — createEntity doesn't
        // know about it, and exposing it in the helper signature would leak
        // the chapter-manual concept into a generic function.
        await supabase
          .from("entities")
          .update({ manual_section_anchor: p.section_anchor })
          .eq("id", entity.id);
        created++;
      }
      toast.success(`${created} entité${created > 1 ? "s" : ""} créée${created > 1 ? "s" : ""} et liée${created > 1 ? "s" : ""}`);
      setProposals(null);
    } catch (err) {
      console.error("Bulk create entities error:", err);
      toast.error(`${created} créée(s), puis erreur — réessaye pour les suivantes`);
    } finally {
      setCreating(false);
    }
  };

  const toggleProposal = (idx: number) => {
    setProposals((prev) =>
      prev ? prev.map((p, i) => (i === idx ? { ...p, selected: !p.selected } : p)) : prev
    );
  };

  const updateProposal = (idx: number, patch: Partial<ProposedEntity>) => {
    setProposals((prev) =>
      prev ? prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)) : prev
    );
  };

  const selectedCount = proposals ? proposals.filter((p) => p.selected && !p.duplicate).length : 0;

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
              Pour ajouter progressivement des sources (Rad Primer, Aunt Minnie,
              Anales, etc.), utilise la carte "Ajouter une source" ci-dessous —
              chaque ajout est préfixé d'une bannière <code className="text-foreground">## Source : X</code>.
              L'éditeur plein texte en bas sert au remplacement total (destructif).
            </div>
          </div>
        </section>

        {/* Append-only card — primary interaction */}
        <section className="bg-card border border-teal/30 rounded-xl p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Ajouter une source</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Le nouveau contenu est ajouté à la fin du manuel, préfixé d'une bannière de source.
            </p>
          </div>
          <input
            type="text"
            value={appendSource}
            onChange={(e) => setAppendSource(e.target.value)}
            placeholder="Source (ex: Rad Primer, Aunt Minnie, ESR EPOS, Crack the Core…)"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal/30"
          />
          <textarea
            value={appendText}
            onChange={(e) => setAppendText(e.target.value)}
            placeholder={"Colle ici la nouvelle matière.\nUtilise ## Titre pour créer une section cherchable."}
            className="w-full min-h-[30vh] bg-background border border-border rounded-lg p-3 text-sm text-foreground font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-teal/30"
          />
          <button
            onClick={handleAppend}
            disabled={appending || !appendText.trim()}
            className="w-full flex items-center justify-center gap-1.5 h-10 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-light transition-colors disabled:opacity-40"
          >
            {appending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Ajout en cours…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Ajouter à la fin du manuel
              </>
            )}
          </button>
        </section>

        {/* Claude actions: generate manual + auto-link entities + bulk regen */}
        {chapter && topic && (
          <ChapterClaudeActions
            chapterId={chapter.id}
            chapterName={chapter.name}
            topicName={topic.name}
            manualContent={content}
            dirty={dirty}
            onGenerated={(markdown) => {
              setContent(markdown);
              setDirty(true);
            }}
          />
        )}

        {/* Full edit / replace mode — below append card, clearly labelled destructive */}
        <section className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Édition complète (destructif)</span>
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
          </section>
        )}

        {sections.length > 0 && !proposals && (
          <section className="space-y-2">
            <button
              onClick={handleExtract}
              disabled={extracting || dirty || !content.trim()}
              className="w-full flex items-center justify-center gap-2 h-11 bg-amber/10 border border-amber/30 text-amber rounded-xl text-sm font-medium hover:bg-amber/20 transition-colors disabled:opacity-50"
            >
              {extracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extraction en cours… (10-30s)
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Créer des entités depuis ce manuel
                </>
              )}
            </button>
            {dirty && (
              <p className="text-[11px] text-muted-foreground text-center">
                Enregistre d'abord le manuel pour activer l'extraction.
              </p>
            )}
          </section>
        )}

        {proposals && (
          <section className="space-y-3 bg-card border border-amber/30 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-foreground">
                  {proposals.length} entité{proposals.length > 1 ? "s" : ""} proposée{proposals.length > 1 ? "s" : ""}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Décoche les superflues. Ajuste section ou type si besoin. Les doublons (déjà présents dans ce chapitre) sont grisés.
                </p>
              </div>
              <button
                onClick={() => setProposals(null)}
                className="p-1 rounded-lg hover:bg-background/50 text-muted-foreground"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground flex-shrink-0">Source :</label>
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground"
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <ul className="divide-y divide-border border border-border rounded-lg bg-background">
              {proposals.map((p, i) => (
                <li
                  key={i}
                  className={`p-3 ${p.duplicate ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => !p.duplicate && toggleProposal(i)}
                      disabled={p.duplicate}
                      className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 ${
                        p.selected && !p.duplicate
                          ? "bg-teal border-teal"
                          : "bg-background border-border"
                      }`}
                      aria-label={p.selected ? "Désélectionner" : "Sélectionner"}
                    >
                      {p.selected && !p.duplicate && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updateProposal(i, { name: e.target.value })}
                        disabled={p.duplicate}
                        className="w-full bg-background border border-border rounded-md px-2 py-1 text-sm text-foreground"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={p.section_anchor}
                          onChange={(e) => updateProposal(i, { section_anchor: e.target.value })}
                          disabled={p.duplicate}
                          className="flex-1 bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground min-w-0"
                        >
                          {sections.map((s) => (
                            <option key={s.title} value={s.title}>
                              {s.title}
                            </option>
                          ))}
                        </select>
                        <select
                          value={p.entity_type}
                          onChange={(e) => updateProposal(i, { entity_type: e.target.value as EntityType })}
                          disabled={p.duplicate}
                          className="bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground"
                        >
                          <option value="single_diagnosis">Diagnostic</option>
                          <option value="ddx_pair">DDx</option>
                          <option value="concept">Concept</option>
                          <option value="protocol">Protocole</option>
                        </select>
                      </div>
                      {p.duplicate && (
                        <p className="text-[10px] text-amber">Déjà présente dans ce chapitre</p>
                      )}
                      {!p.duplicate && p.reason && (
                        <p className="text-[10px] text-muted-foreground italic">{p.reason}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <button
              onClick={handleBulkCreate}
              disabled={creating || selectedCount === 0}
              className="w-full flex items-center justify-center gap-2 h-10 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-light transition-colors disabled:opacity-50"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Création en cours…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Créer et lier {selectedCount} entité{selectedCount > 1 ? "s" : ""}
                </>
              )}
            </button>
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
