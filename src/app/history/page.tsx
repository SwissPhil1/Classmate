"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getTestResults } from "@/lib/supabase/queries";
import type { TestResultRecord, TestResult } from "@/lib/types";
import { ArrowLeft, BookOpen, Check, AlertTriangle, XCircle, Sparkles } from "lucide-react";
import Link from "next/link";

type DateRange = "1d" | "7d" | "30d" | "all";
type ResultFilter = TestResult | "all";

const RESULT_CONFIG = {
  correct: { icon: Check, color: "text-correct", bg: "bg-correct/10", border: "border-correct/20", label: "Correct" },
  partial: { icon: AlertTriangle, color: "text-partial", bg: "bg-partial/10", border: "border-partial/20", label: "Partiel" },
  wrong: { icon: XCircle, color: "text-wrong", bg: "bg-wrong/10", border: "border-wrong/20", label: "Incorrect" },
};

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return "Aujourd'hui";
  if (date.getTime() === yesterday.getTime()) return "Hier";

  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getDateFrom(range: DateRange): string | undefined {
  if (range === "all") return undefined;
  if (range === "1d") return new Date().toISOString().split("T")[0];
  const now = new Date();
  const days = range === "7d" ? 7 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return from.toISOString().split("T")[0];
}

export default function HistoryPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const supabase = createClient();

  const [results, setResults] = useState<TestResultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setAnalysis(null);

    const dateFrom = getDateFrom(dateRange);
    const dateTo = new Date().toISOString().split("T")[0];

    getTestResults(supabase, { dateFrom, dateTo })
      .then(setResults)
      .catch((err) => console.error("History load error:", err))
      .finally(() => setLoading(false));
  }, [user, dateRange]);

  const filtered = resultFilter === "all"
    ? results
    : results.filter((r) => r.result === resultFilter);

  // Group by date
  const grouped = new Map<string, TestResultRecord[]>();
  for (const r of filtered) {
    const date = r.date || r.created_at || "";
    const dayKey = date.split("T")[0];
    const list = grouped.get(dayKey) || [];
    list.push(r);
    grouped.set(dayKey, list);
  }

  const sortedDates = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));

  const correct = results.filter((r) => r.result === "correct").length;
  const partial = results.filter((r) => r.result === "partial").length;
  const wrong = results.filter((r) => r.result === "wrong").length;

  const errorsInFiltered = filtered.filter(
    (r) => r.result === "wrong" || r.result === "partial"
  );

  const periodLabel = dateRange === "1d" ? "Aujourd'hui"
    : dateRange === "7d" ? "Les 7 derniers jours"
    : dateRange === "30d" ? "Les 30 derniers jours"
    : "Toute la période";

  const handleAnalyze = async () => {
    if (errorsInFiltered.length === 0) return;
    setAnalyzing(true);
    try {
      // Group ALL filtered results by entity with topic info
      type EntityEntry = { name: string; chapter?: { name: string; topic?: { name: string } } };
      const entityMap = new Map<string, {
        entity_name: string;
        topic_name: string;
        chapter_name: string;
        results: { result: string; question: string; feedback: string | null }[];
      }>();

      for (const r of filtered) {
        const ent = r.entity as EntityEntry | undefined;
        const key = r.entity_id;
        if (!entityMap.has(key)) {
          entityMap.set(key, {
            entity_name: ent?.name || "Inconnu",
            topic_name: ent?.chapter?.topic?.name || "Autre",
            chapter_name: ent?.chapter?.name || "—",
            results: [],
          });
        }
        entityMap.get(key)!.results.push({
          result: r.result,
          question: r.question_text,
          feedback: r.feedback,
        });
      }

      const res = await fetch("/api/claude/session-debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "history",
          period: periodLabel,
          summaries: Array.from(entityMap.values()),
          total_correct: filtered.filter((r) => r.result === "correct").length,
          total_partial: filtered.filter((r) => r.result === "partial").length,
          total_wrong: filtered.filter((r) => r.result === "wrong").length,
        }),
      });
      const data = await res.json();
      setAnalysis(data.analysis || data.error);
    } catch {
      setAnalysis("Analyse indisponible temporairement");
    } finally {
      setAnalyzing(false);
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
          <h1 className="text-lg font-bold text-foreground">Historique</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {loading || userLoading || !user ? (
          <div className="animate-pulse text-muted-foreground text-center py-12">
            Chargement...
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div className="flex gap-2 justify-center">
              {([["correct", correct], ["partial", partial], ["wrong", wrong]] as const).map(
                ([key, count]) => {
                  const config = RESULT_CONFIG[key];
                  const Icon = config.icon;
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${config.bg} border ${config.border}`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                      <span className={`text-sm font-medium ${config.color}`}>{count}</span>
                    </div>
                  );
                }
              )}
            </div>

            {/* Filters */}
            <div className="space-y-2">
              {/* Date range */}
              <div className="flex gap-2 justify-center flex-wrap">
                {([["1d", "Aujourd'hui"], ["7d", "7 jours"], ["30d", "30 jours"], ["all", "Tout"]] as const).map(
                  ([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setDateRange(value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        dateRange === value
                          ? "bg-teal text-white"
                          : "bg-card border border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>

              {/* Result filter */}
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => { setResultFilter("all"); setAnalysis(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    resultFilter === "all"
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Tous ({results.length})
                </button>
                {(["partial", "wrong"] as const).map((r) => {
                  const config = RESULT_CONFIG[r];
                  const count = results.filter((res) => res.result === r).length;
                  return (
                    <button
                      key={r}
                      onClick={() => { setResultFilter(resultFilter === r ? "all" : r); setAnalysis(null); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        resultFilter === r
                          ? `${config.bg} ${config.color} border ${config.border}`
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {config.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Claude analysis */}
            {errorsInFiltered.length > 0 && (
              <div className="space-y-3">
                {analysis ? (
                  <div className="text-left bg-teal/5 border border-teal/20 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-medium text-teal uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Analyse des erreurs
                    </p>
                    <div className="text-xs text-foreground whitespace-pre-wrap leading-relaxed prose-headings:text-sm prose-headings:font-semibold prose-headings:text-foreground">
                      {analysis}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className="flex items-center justify-center gap-2 w-full h-12 bg-teal/10 border border-teal/20 rounded-xl text-sm font-medium text-teal hover:bg-teal/20 transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    {analyzing ? "Analyse en cours..." : `Analyser mes erreurs — ${periodLabel.toLowerCase()} (${errorsInFiltered.length})`}
                  </button>
                )}
              </div>
            )}

            {/* Results */}
            {sortedDates.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Aucun résultat pour cette période</p>
              </div>
            ) : (
              <div className="space-y-6">
                {sortedDates.map((dateKey) => (
                  <div key={dateKey} className="space-y-2">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {formatDateHeader(dateKey)}
                    </h3>
                    <div className="space-y-1.5">
                      {(grouped.get(dateKey) || []).map((r) => {
                        const config = RESULT_CONFIG[r.result];
                        const Icon = config.icon;
                        const entityName =
                          (r.entity as { name?: string } | undefined)?.name || "—";
                        const sessionInfo = r.session as { session_type?: string } | undefined;
                        return (
                          <Link
                            key={r.id}
                            href={`/brief/${r.entity_id}`}
                            className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:border-teal/40 transition-colors"
                          >
                            <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">
                                {entityName}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {r.question_text.length > 80
                                  ? r.question_text.substring(0, 80) + "..."
                                  : r.question_text}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {r.is_pretest && (
                                  <span className="text-[10px] bg-amber/10 text-amber px-1.5 py-0.5 rounded">
                                    Pré-test
                                  </span>
                                )}
                                {sessionInfo?.session_type && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {sessionInfo.session_type === "weekend" ? "Weekend" :
                                     sessionInfo.session_type === "short" ? "Courte" :
                                     sessionInfo.session_type === "weak_items" ? "Fragiles" :
                                     sessionInfo.session_type === "weekly_review" ? "Hebdo" :
                                     sessionInfo.session_type === "monthly_review" ? "Mensuel" :
                                     sessionInfo.session_type}
                                  </span>
                                )}
                              </div>
                            </div>
                            <BookOpen className="w-4 h-4 text-teal flex-shrink-0" />
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
