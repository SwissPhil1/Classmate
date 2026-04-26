"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getEntities, getTestResults } from "@/lib/supabase/queries";
import type { Entity, TestResultRecord } from "@/lib/types";
import {
  aggregateStatusCounts,
  aggregateGlobalAccuracy,
  aggregateTopicAccuracy,
  rankWeakEntities,
  recentlyTestedEntities,
  formatRelativeDate,
} from "@/lib/stats";
import { ArrowLeft, Check, AlertTriangle, XCircle, TrendingUp, TrendingDown, BookOpen, Zap, Loader2, Sparkles, FileSearch, ChevronRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cleanupInvalidMnemonics, CANONICAL_MNEMONIC_NAMES } from "@/lib/mnemonic-whitelist";

const RESULT_ICON = {
  correct: { Icon: Check, color: "text-correct" },
  partial: { Icon: AlertTriangle, color: "text-partial" },
  wrong: { Icon: XCircle, color: "text-wrong" },
} as const;

export default function StatsPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const supabase = createClient();

  const [entities, setEntities] = useState<Entity[]>([]);
  const [results, setResults] = useState<TestResultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [lastBackfill, setLastBackfill] = useState<{ vital: number; mnemonic: number; evaluated: number } | null>(null);
  const [cleaningMnemos, setCleaningMnemos] = useState(false);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([getEntities(supabase, user.id), getTestResults(supabase, user.id, {})])
      .then(([e, r]) => {
        setEntities(e);
        setResults(r);
      })
      .catch((err) => console.error("Stats load error:", err))
      .finally(() => setLoading(false));
  }, [user]);

  const statusCounts = useMemo(() => aggregateStatusCounts(entities), [entities]);
  const accuracy = useMemo(() => aggregateGlobalAccuracy(results), [results]);
  const topicAccuracy = useMemo(() => aggregateTopicAccuracy(results, 5), [results]);
  const weakRows = useMemo(() => rankWeakEntities(entities, results, 10), [entities, results]);
  const recentRows = useMemo(() => recentlyTestedEntities(entities, results, 15, 7), [entities, results]);

  const topTopics = topicAccuracy.slice(0, 5);
  const bottomTopics = [...topicAccuracy].reverse().slice(0, 5);

  const vitalCount = useMemo(
    () => entities.filter((e) => e.priority === "vital").length,
    [entities]
  );

  const reloadEntities = async () => {
    if (!user) return;
    try {
      const e = await getEntities(supabase, user.id);
      setEntities(e);
    } catch (err) {
      console.error("Reload entities error:", err);
    }
  };

  const handleCleanupMnemos = async () => {
    if (!user || cleaningMnemos) return;
    setCleaningMnemos(true);
    try {
      const { cleared, rows } = await cleanupInvalidMnemonics(supabase, user.id);
      if (cleared === 0) {
        toast.success("Aucune mnémonique hallucinée détectée");
      } else {
        const preview = rows
          .slice(0, 3)
          .map((r) => `${r.entity_name} (${r.mnemonic_name ?? "—"})`)
          .join(", ");
        const suffix = rows.length > 3 ? `, +${rows.length - 3} autres` : "";
        toast.success(`${cleared} mnémo${cleared > 1 ? "s" : ""} hors whitelist effacée${cleared > 1 ? "s" : ""} : ${preview}${suffix}`);
      }
      await reloadEntities();
    } catch (err) {
      console.error("Cleanup mnemonics error:", err);
      toast.error("Nettoyage impossible");
    } finally {
      setCleaningMnemos(false);
    }
  };

  const handleBackfill = async () => {
    if (backfilling) return;
    setBackfilling(true);
    try {
      const res = await fetch("/api/claude/backfill-vital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Backfill impossible");
        return;
      }
      setLastBackfill({
        vital: data.marked_vital ?? 0,
        mnemonic: data.marked_mnemonic ?? 0,
        evaluated: data.evaluated ?? 0,
      });
      toast.success(
        `${data.marked_vital ?? 0} entités marquées vitales · ${data.marked_mnemonic ?? 0} avec mnémo`
      );
      await reloadEntities();
    } catch (err) {
      console.error("Backfill error:", err);
      toast.error("Backfill indisponible");
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-2 rounded-lg hover:bg-card transition-colors"
            aria-label="Retour"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Statistiques</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {loading || userLoading || !user ? (
          <div className="animate-pulse text-muted-foreground text-center py-12">
            Chargement...
          </div>
        ) : (
          <>
            {/* Auto-tag vital + mnemonics with Claude */}
            <section className="bg-card border border-amber/30 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-amber flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Sujets vitaux & mnémos · {vitalCount} taggés
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Claude scanne tes briefs et marque les entités à forte asymétrie clinique
                    (can&apos;t miss) + les mnémoniques vraiment utiles. Tes choix manuels restent
                    intacts.
                  </p>
                </div>
              </div>
              <button
                onClick={handleBackfill}
                disabled={backfilling}
                className="w-full flex items-center justify-center gap-2 h-10 bg-amber/10 border border-amber/30 text-amber rounded-lg text-sm font-medium hover:bg-amber/20 transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {backfilling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Évaluation en cours… (peut prendre 30–60s)
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {vitalCount === 0 ? "Lancer le tag automatique" : "Re-scanner avec Claude"}
                  </>
                )}
              </button>
              {lastBackfill && !backfilling && (
                <p className="text-xs text-muted-foreground text-center">
                  Dernier scan : {lastBackfill.evaluated} évaluées · {lastBackfill.vital} vitales ·{" "}
                  {lastBackfill.mnemonic} avec mnémo
                </p>
              )}

              <div className="pt-2 border-t border-border/50 space-y-2">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-teal flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Whitelist active : {CANONICAL_MNEMONIC_NAMES.length} mnémos validées contre
                    Crack the Core + Core Radiology. Toute mnémo hors liste est rejetée.
                  </p>
                </div>
                <button
                  onClick={handleCleanupMnemos}
                  disabled={cleaningMnemos}
                  className="w-full flex items-center justify-center gap-2 h-9 border border-teal/30 text-teal rounded-lg text-xs font-medium hover:bg-teal/5 transition-colors disabled:opacity-50"
                >
                  {cleaningMnemos ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Nettoyage en cours…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Nettoyer les mnémos hallucinées
                    </>
                  )}
                </button>
              </div>
            </section>

            {/* Audit briefs entry point */}
            <Link
              href="/stats/audit"
              className="flex items-center gap-3 bg-card border border-teal/30 rounded-xl p-4 hover:border-teal/50 transition-colors"
            >
              <FileSearch className="w-5 h-5 text-teal flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Auditer mes briefs
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Claude scanne chaque brief et flag les manques (DDx incomplet,
                  perle oubliée, regroupement thématique). Tu corriges à la carte.
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </Link>

            {/* Section 1 — Vue d'ensemble */}
            <section className="space-y-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Vue d&apos;ensemble
              </h2>
              <div className="grid grid-cols-4 gap-2">
                <StatusCard label="Nouveau" count={statusCounts.new} tone="muted" />
                <StatusCard label="Actif" count={statusCounts.active} tone="chart" />
                <StatusCard label="Solide" count={statusCounts.solid} tone="correct" />
                <StatusCard label="Archivé" count={statusCounts.archived} tone="archived" />
              </div>

              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Précision globale
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {accuracy.total === 0 ? "—" : `${accuracy.pctCorrect}%`}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {accuracy.total} test{accuracy.total > 1 ? "s" : ""}
                  </p>
                </div>
                {accuracy.total > 0 && (
                  <div className="flex h-2 rounded-full overflow-hidden bg-border">
                    <div
                      className="bg-correct"
                      style={{ width: `${(accuracy.correct / accuracy.total) * 100}%` }}
                    />
                    <div
                      className="bg-partial"
                      style={{ width: `${(accuracy.partial / accuracy.total) * 100}%` }}
                    />
                    <div
                      className="bg-wrong"
                      style={{ width: `${(accuracy.wrong / accuracy.total) * 100}%` }}
                    />
                  </div>
                )}
                <div className="flex gap-4 text-xs">
                  <span className="text-correct">✓ {accuracy.correct}</span>
                  <span className="text-partial">~ {accuracy.partial}</span>
                  <span className="text-wrong">✗ {accuracy.wrong}</span>
                </div>
              </div>
            </section>

            {/* Section 2 — Forts / faibles par thème */}
            <section className="space-y-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Points forts / faibles par thème
              </h2>
              {topicAccuracy.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Aucun thème avec ≥ 5 tests pour l&apos;instant.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TopicList
                    title="Points forts"
                    icon={<TrendingUp className="w-3.5 h-3.5 text-correct" />}
                    topics={topTopics}
                    barClass="bg-correct"
                    accentBorder="border-correct/20"
                  />
                  <TopicList
                    title="À renforcer"
                    icon={<TrendingDown className="w-3.5 h-3.5 text-wrong" />}
                    topics={bottomTopics}
                    barClass="bg-wrong"
                    accentBorder="border-wrong/20"
                  />
                </div>
              )}
            </section>

            {/* Section 3 — À travailler */}
            <section className="space-y-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                À travailler en priorité
              </h2>
              {weakRows.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
                  Tout est solide. Rien à réviser en urgence.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {weakRows.map((row) => (
                    <Link
                      key={row.entity.id}
                      href={`/brief/${row.entity.id}`}
                      className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:border-teal/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{row.entity.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {row.entity.chapter?.name ?? "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {row.recentTotal > 0 ? (
                          <span className="text-[10px] bg-wrong/10 text-wrong px-1.5 py-0.5 rounded">
                            {row.recentCorrect}/{row.recentTotal}
                          </span>
                        ) : (
                          <span className="text-[10px] bg-amber/10 text-amber px-1.5 py-0.5 rounded">
                            jamais
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelativeDate(row.lastTested)}
                        </span>
                      </div>
                      <BookOpen className="w-4 h-4 text-teal flex-shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Section 4 — Travaillé récemment */}
            <section className="space-y-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Travaillé récemment (7 derniers jours)
              </h2>
              {recentRows.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
                  Aucune entité testée cette semaine.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {recentRows.map((row) => {
                    const { Icon, color } = RESULT_ICON[row.lastResult];
                    return (
                      <Link
                        key={row.entity.id}
                        href={`/brief/${row.entity.id}`}
                        className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:border-teal/40 transition-colors"
                      >
                        <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{row.entity.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {row.entity.chapter?.name ?? "—"}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {formatRelativeDate(row.lastTested)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StatusCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "muted" | "chart" | "correct" | "archived";
}) {
  const toneClass =
    tone === "correct"
      ? "text-correct"
      : tone === "chart"
        ? "text-chart-1"
        : tone === "archived"
          ? "text-archived"
          : "text-muted-foreground";
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-3 text-center">
      <p className={`text-2xl font-bold ${toneClass}`}>{count}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
        {label}
      </p>
    </div>
  );
}

function TopicList({
  title,
  icon,
  topics,
  barClass,
  accentBorder,
}: {
  title: string;
  icon: React.ReactNode;
  topics: { topicName: string; correct: number; total: number; pct: number }[];
  barClass: string;
  accentBorder: string;
}) {
  return (
    <Link
      href="/topics"
      className={`block bg-card border ${accentBorder} rounded-xl p-4 space-y-3 hover:border-teal/40 transition-colors`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-xs font-medium text-foreground uppercase tracking-wider">
          {title}
        </p>
      </div>
      {topics.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-2">
          {topics.map((t) => (
            <li key={t.topicName} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-foreground truncate">{t.topicName}</span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {t.pct}% · {t.total}
                </span>
              </div>
              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <div className={`h-full ${barClass}`} style={{ width: `${t.pct}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
