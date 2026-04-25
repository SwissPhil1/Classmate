"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, AlertTriangle, Loader2, RefreshCw, Sparkles, EyeOff, FolderSymlink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getEntities, updateEntity } from "@/lib/supabase/queries";
import type { Entity, BriefAuditReport, BriefAuditItem } from "@/lib/types";

const AUDIT_CHUNK_SIZE = 30;

export default function AuditPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<BriefAuditReport | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);

  const [auditing, setAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState<{ processed: number; total: number } | null>(null);
  const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set());
  const [applyingAll, setApplyingAll] = useState(false);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadInitial = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: settings }, ents] = await Promise.all([
        supabase.from("user_settings").select("last_audit").eq("user_id", user.id).single(),
        getEntities(supabase, user.id),
      ]);
      setReport((settings?.last_audit as BriefAuditReport | null) ?? null);
      setEntities(ents);
    } catch (err) {
      console.error("Audit load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const entitiesById = useMemo(() => {
    const m = new Map<string, Entity>();
    for (const e of entities) m.set(e.id, e);
    return m;
  }, [entities]);

  const runAudit = async (reset = true) => {
    if (auditing) return;
    setAuditing(true);
    setAuditProgress(null);
    try {
      let offset = 0;
      let firstCall = true;
      while (true) {
        const res = await fetch("/api/claude/audit-briefs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, chunk_size: AUDIT_CHUNK_SIZE, reset: firstCall && reset }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Audit impossible");
          return;
        }
        setAuditProgress({
          processed: offset + (data.processed ?? 0),
          total: data.total ?? 0,
        });
        if (data.done || data.next_offset === null) break;
        offset = data.next_offset;
        firstCall = false;
      }
      await loadInitial();
      toast.success("Audit terminé");
    } catch (err) {
      console.error("Audit run error:", err);
      toast.error("Audit indisponible");
    } finally {
      setAuditing(false);
    }
  };

  const toggleIgnore = async (entityId: string) => {
    if (!user || !report) return;
    const updated: BriefAuditReport = {
      ...report,
      items: report.items.map((it) =>
        it.entity_id === entityId ? { ...it, ignored: !it.ignored } : it
      ),
    };
    setReport(updated);
    try {
      await supabase
        .from("user_settings")
        .update({ last_audit: updated })
        .eq("user_id", user.id);
    } catch (err) {
      console.error("Audit toggle ignore error:", err);
      setReport(report);
      toast.error("Impossible de sauver");
    }
  };

  const applyFix = async (item: BriefAuditItem) => {
    const entity = entitiesById.get(item.entity_id);
    if (!entity || !user || applyingIds.has(item.entity_id)) return;
    setApplyingIds((s) => new Set(s).add(item.entity_id));

    try {
      const auditFeedback = [
        ...item.gaps,
        item.suggested_grouping ? `Regroupement DDx suggéré : ${item.suggested_grouping}` : null,
      ]
        .filter(Boolean)
        .join("\n- ");
      const feedbackText = auditFeedback ? `- ${auditFeedback}` : "";

      // NOTE: deliberately NOT passing existing_content here. The brief we'd
      // pass in is already the broken one we're trying to fix (often truncated
      // mid-sentence). Claude would treat the truncation as an intentional
      // manual edit and reproduce it. Regenerate fresh from reference_text.
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
          audit_feedback: feedbackText,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "Correction impossible");
        return;
      }

      const { upsertBrief } = await import("@/lib/supabase/queries");
      await upsertBrief(supabase, {
        entity_id: entity.id,
        user_id: user.id,
        content: data.content,
        qa_pairs: data.qa_pairs,
        difficulty_level: entity.difficulty_level,
      });

      // Auto-tag side effects (respect manual override)
      const meta = data.meta as { has_mnemonic?: boolean; mnemonic_name?: string | null; is_critical?: boolean } | undefined;
      if (meta) {
        const patch: Partial<Entity> = {};
        if (typeof meta.has_mnemonic === "boolean" && meta.has_mnemonic !== entity.has_mnemonic) {
          patch.has_mnemonic = meta.has_mnemonic;
        }
        if (meta.mnemonic_name !== undefined && meta.mnemonic_name !== entity.mnemonic_name) {
          patch.mnemonic_name = meta.mnemonic_name ?? null;
        }
        const shouldBeVital = meta.has_mnemonic === true || meta.is_critical === true;
        const canAutoSet = entity.priority_source !== "manual";
        if (canAutoSet && shouldBeVital && entity.priority !== "vital") {
          patch.priority = "vital";
          patch.priority_source = "auto";
        }
        if (Object.keys(patch).length > 0) {
          await updateEntity(supabase, entity.id, patch);
        }
      }

      // Mark as ok in the report
      if (user && report) {
        const updated: BriefAuditReport = {
          ...report,
          items: report.items.map((it) =>
            it.entity_id === item.entity_id
              ? { ...it, status: "ok" as const, gaps: [], suggested_grouping: null }
              : it
          ),
        };
        setReport(updated);
        await supabase.from("user_settings").update({ last_audit: updated }).eq("user_id", user.id);
      }
      toast.success(`Correction appliquée : ${entity.name}`);
    } catch (err) {
      console.error("Apply fix error:", err);
      toast.error("Erreur lors de la correction");
    } finally {
      setApplyingIds((s) => {
        const next = new Set(s);
        next.delete(item.entity_id);
        return next;
      });
    }
  };

  const applyAll = async () => {
    if (applyingAll || !report) return;
    const pending = report.items.filter((it) => it.status === "needs_fix" && !it.ignored);
    if (pending.length === 0) {
      toast.message("Rien à corriger");
      return;
    }
    if (!confirm(`Appliquer ${pending.length} correction${pending.length > 1 ? "s" : ""} ? Cela peut prendre plusieurs minutes et coûter ~$${(pending.length * 0.06).toFixed(2)}.`)) {
      return;
    }
    setApplyingAll(true);
    for (const item of pending) {
      await applyFix(item);
    }
    setApplyingAll(false);
    toast.success("Corrections en masse terminées");
  };

  const moveChapter = async (entityId: string, newChapterId: string) => {
    if (!user) return;
    try {
      await updateEntity(supabase, entityId, { chapter_id: newChapterId });
      // Mark suggestion as applied locally (drop suggested_chapter fields)
      if (report) {
        const updated: BriefAuditReport = {
          ...report,
          items: report.items.map((it) =>
            it.entity_id === entityId
              ? {
                  ...it,
                  suggested_chapter_id: null,
                  suggested_chapter_name: null,
                  suggested_chapter_topic: null,
                }
              : it
          ),
        };
        setReport(updated);
        await supabase
          .from("user_settings")
          .update({ last_audit: updated })
          .eq("user_id", user.id);
      }
      // Reload entities to reflect new chapter
      const ents = await getEntities(supabase, user.id);
      setEntities(ents);
      toast.success("Entité déplacée");
    } catch (err) {
      console.error("Move chapter error:", err);
      toast.error("Déplacement impossible");
    }
  };

  const hasActionable = (it: BriefAuditItem) =>
    it.status === "needs_fix" || it.suggested_chapter_id !== null;

  const needsFix = (report?.items ?? []).filter((it) => hasActionable(it) && !it.ignored);
  const ignored = (report?.items ?? []).filter((it) => hasActionable(it) && it.ignored);
  const okCount = (report?.items ?? []).filter((it) => !hasActionable(it)).length;

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/stats")}
            className="p-2 rounded-lg hover:bg-card transition-colors"
            aria-label="Retour"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Audit des briefs</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {loading || userLoading || !user ? (
          <div className="animate-pulse text-muted-foreground text-center py-12">
            Chargement...
          </div>
        ) : (
          <>
            {/* Run audit card */}
            <section className="bg-card border border-teal/30 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-teal flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Audit Claude des briefs
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Claude lit chaque brief et flag les manques (DDx incomplet, perle
                    manquante, regroupement thématique possible). Sans modif. Tu appliques
                    ensuite au cas par cas.
                  </p>
                  {report?.generated_at && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Dernier audit : {new Date(report.generated_at).toLocaleString("fr-FR")}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => runAudit(true)}
                disabled={auditing}
                className="w-full flex items-center justify-center gap-2 h-10 bg-teal/10 border border-teal/30 text-teal rounded-lg text-sm font-medium hover:bg-teal/20 transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {auditing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {auditProgress
                      ? `Audit en cours… ${auditProgress.processed}/${auditProgress.total}`
                      : "Audit en cours…"}
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    {report ? "Re-lancer l’audit" : "Lancer un audit"}
                  </>
                )}
              </button>
            </section>

            {report && (
              <>
                {/* Summary */}
                <section className="grid grid-cols-3 gap-2">
                  <Summary label="À corriger" value={needsFix.length} tone="wrong" />
                  <Summary label="OK" value={okCount} tone="correct" />
                  <Summary label="Ignorés" value={ignored.length} tone="muted" />
                </section>

                {/* Apply all */}
                {needsFix.length > 0 && (
                  <button
                    onClick={applyAll}
                    disabled={applyingAll || applyingIds.size > 0}
                    className="w-full flex items-center justify-center gap-2 h-10 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-light transition-colors disabled:opacity-50"
                  >
                    {applyingAll ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Correction en cours…
                      </>
                    ) : (
                      <>Tout appliquer ({needsFix.length})</>
                    )}
                  </button>
                )}

                {/* Needs-fix list */}
                {needsFix.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      À corriger · {needsFix.length}
                    </h2>
                    <div className="space-y-2">
                      {needsFix.map((item) => (
                        <AuditCard
                          key={item.entity_id}
                          item={item}
                          entity={entitiesById.get(item.entity_id)}
                          applying={applyingIds.has(item.entity_id)}
                          onApply={() => applyFix(item)}
                          onIgnore={() => toggleIgnore(item.entity_id)}
                          onMoveChapter={
                            item.suggested_chapter_id
                              ? () => moveChapter(item.entity_id, item.suggested_chapter_id!)
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Ignored list (collapsed style) */}
                {ignored.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Ignorés · {ignored.length}
                    </h2>
                    <div className="space-y-1.5">
                      {ignored.map((item) => (
                        <div
                          key={item.entity_id}
                          className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl px-3 py-2 opacity-60"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">
                              {entitiesById.get(item.entity_id)?.name ?? "—"}
                            </p>
                          </div>
                          <button
                            onClick={() => toggleIgnore(item.entity_id)}
                            className="text-xs text-teal hover:text-teal-light transition-colors"
                          >
                            Ré-activer
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {needsFix.length === 0 && ignored.length === 0 && (
                  <div className="bg-card border border-correct/20 rounded-xl p-6 text-center space-y-2">
                    <Check className="w-8 h-8 text-correct mx-auto" />
                    <p className="text-sm text-foreground font-medium">
                      Tous les briefs sont OK
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {okCount} brief{okCount > 1 ? "s" : ""} évalué{okCount > 1 ? "s" : ""} · aucun manque détecté.
                    </p>
                  </div>
                )}
              </>
            )}

            {!report && !auditing && (
              <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
                Aucun audit lancé pour l&apos;instant. Clique sur «&nbsp;Lancer un audit&nbsp;» pour démarrer.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "correct" | "wrong" | "muted";
}) {
  const color =
    tone === "correct" ? "text-correct" : tone === "wrong" ? "text-wrong" : "text-muted-foreground";
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
        {label}
      </p>
    </div>
  );
}

function AuditCard({
  item,
  entity,
  applying,
  onApply,
  onIgnore,
  onMoveChapter,
}: {
  item: BriefAuditItem;
  entity: Entity | undefined;
  applying: boolean;
  onApply: () => void;
  onIgnore: () => void;
  onMoveChapter?: () => void;
}) {
  if (!entity) {
    return (
      <div className="bg-card border border-border rounded-xl p-3 text-xs text-muted-foreground">
        Entité introuvable (id: {item.entity_id})
      </div>
    );
  }
  const hasGaps = item.gaps.length > 0;
  const hasChapterSuggestion = item.suggested_chapter_id && item.suggested_chapter_name;

  return (
    <div className="bg-card border border-wrong/20 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-wrong flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{entity.name}</p>
          <p className="text-xs text-muted-foreground">{entity.chapter?.name ?? "—"}</p>
        </div>
      </div>

      {hasGaps && (
        <ul className="space-y-1 pl-6">
          {item.gaps.map((g, i) => (
            <li key={i} className="text-xs text-foreground">
              · {g}
            </li>
          ))}
        </ul>
      )}

      {item.suggested_grouping && (
        <div className="pl-6 text-xs text-muted-foreground">
          Regroupement suggéré :{" "}
          <span className="text-foreground">{item.suggested_grouping}</span>
        </div>
      )}

      {hasChapterSuggestion && (
        <div className="pl-6 bg-amber/5 border border-amber/20 rounded-lg p-2 space-y-1.5">
          <p className="text-xs text-foreground">
            <FolderSymlink className="w-3 h-3 inline-block mr-1 text-amber align-text-bottom" />
            Chapitre mieux adapté :{" "}
            <span className="font-medium">{item.suggested_chapter_name}</span>
            {item.suggested_chapter_topic && (
              <span className="text-muted-foreground"> ({item.suggested_chapter_topic})</span>
            )}
          </p>
          {onMoveChapter && (
            <button
              onClick={onMoveChapter}
              disabled={applying}
              className="text-xs text-amber hover:text-amber/80 transition-colors disabled:opacity-50"
            >
              Déplacer →
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          {hasGaps && (
            <button
              onClick={onApply}
              disabled={applying}
              className="flex items-center gap-1.5 text-xs bg-teal text-white px-3 py-1.5 rounded-lg hover:bg-teal-light transition-colors disabled:opacity-50"
            >
              {applying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Correction…
                </>
              ) : (
                <>
                  Appliquer la correction
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
          <Link
            href={`/brief/${entity.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Voir le brief
          </Link>
        </div>
        <button
          onClick={onIgnore}
          disabled={applying}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-amber transition-colors"
          title="Ignorer cette entité dans ce rapport"
        >
          <EyeOff className="w-3.5 h-3.5" />
          Ignorer
        </button>
      </div>
    </div>
  );
}
