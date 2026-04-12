"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import type { AnswerRecord, SessionType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Check, AlertTriangle, XCircle, BookOpen, BarChart3, Clock, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";

interface SessionEndProps {
  answers: AnswerRecord[];
  sessionType?: SessionType;
  sessionId?: string;
  onReturn: () => void;
}

const RESULT_CONFIG = {
  correct: { icon: Check, color: "text-correct", bg: "bg-correct/10", border: "border-correct/20", label: "Correct" },
  partial: { icon: AlertTriangle, color: "text-partial", bg: "bg-partial/10", border: "border-partial/20", label: "Partiel" },
  wrong: { icon: XCircle, color: "text-wrong", bg: "bg-wrong/10", border: "border-wrong/20", label: "Incorrect" },
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  short: "Session courte",
  weekend: "Session weekend",
  topic_study: "Étude par thème",
  weekly_review: "Révision hebdomadaire",
  monthly_review: "Révision mensuelle",
  weak_items: "Consolidation fragiles",
};

export function SessionEnd({ answers, sessionType, onReturn }: SessionEndProps) {
  const correct = answers.filter((a) => a.result === "correct").length;
  const partial = answers.filter((a) => a.result === "partial").length;
  const wrong = answers.filter((a) => a.result === "wrong").length;
  const total = answers.length;
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showErrorReview, setShowErrorReview] = useState(false);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  useEffect(() => {
    if (percentage >= 80) {
      const duration = 2000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.7 },
          colors: ["#0D9488", "#10B981", "#F59E0B"],
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.7 },
          colors: ["#0D9488", "#10B981", "#F59E0B"],
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
  }, [percentage]);

  // Deduplicate by entity_id, keep worst result per entity
  const entityResults = new Map<string, AnswerRecord>();
  for (const a of answers) {
    const existing = entityResults.get(a.entity_id);
    if (!existing || resultPriority(a.result) > resultPriority(existing.result)) {
      entityResults.set(a.entity_id, a);
    }
  }

  const needsReview = answers.filter(
    (a) => a.result === "wrong" || a.result === "partial"
  );

  // Topic breakdown
  const topicScores = new Map<string, { correct: number; total: number }>();
  for (const a of answers) {
    const topic = a.topic_name || "Autre";
    const existing = topicScores.get(topic) || { correct: 0, total: 0 };
    existing.total++;
    if (a.result === "correct") existing.correct++;
    topicScores.set(topic, existing);
  }

  const topicEntries = Array.from(topicScores.entries())
    .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total));

  const weakestTopic = topicEntries.length > 1
    ? topicEntries.find(([, s]) => s.correct / s.total < 0.5)
    : null;

  const isLongSession = sessionType === "weekend" || sessionType === "weekly_review" || sessionType === "monthly_review";

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const errors = needsReview.map((a) => ({
        entity_name: a.entity_name || "Entité inconnue",
        question: a.question_text,
        user_answer: a.user_answer,
        feedback: a.feedback,
        result: a.result,
      }));

      const res = await fetch("/api/claude/session-debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          errors,
          session_type: sessionType || "short",
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
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Session terminée
          </h1>
          <p className="text-muted-foreground">
            {sessionType && SESSION_TYPE_LABELS[sessionType]
              ? SESSION_TYPE_LABELS[sessionType]
              : null}
            {" — "}
            {total} question{total > 1 ? "s" : ""} répondue{total > 1 ? "s" : ""}
          </p>
        </div>

        {/* Summary counts */}
        <div className="flex gap-3 justify-center">
          {([["correct", correct], ["partial", partial], ["wrong", wrong]] as const).map(
            ([key, count]) => {
              const config = RESULT_CONFIG[key];
              const Icon = config.icon;
              return (
                <div
                  key={key}
                  className={`flex-1 flex flex-col items-center gap-1 ${config.bg} border ${config.border} rounded-xl py-3`}
                >
                  <Icon className={`w-5 h-5 ${config.color}`} />
                  <span className={`font-bold text-lg ${config.color}`}>{count}</span>
                </div>
              );
            }
          )}
        </div>

        {/* Topic breakdown */}
        {topicEntries.length > 1 && (
          <div className="text-left space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Par thème
            </p>
            <div className="space-y-1.5">
              {topicEntries.map(([topic, scores]) => {
                const pct = Math.round((scores.correct / scores.total) * 100);
                const isWeak = pct < 50;
                return (
                  <div
                    key={topic}
                    className="flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2"
                  >
                    <span className="text-sm text-foreground flex-1 truncate">
                      {topic}
                    </span>
                    <span className={`text-xs font-medium ${isWeak ? "text-wrong" : pct >= 80 ? "text-correct" : "text-partial"}`}>
                      {scores.correct}/{scores.total}
                    </span>
                    <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isWeak ? "bg-wrong" : pct >= 80 ? "bg-correct" : "bg-partial"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {weakestTopic && (
              <p className="text-xs text-wrong">
                Focus recommandé : {weakestTopic[0]}
              </p>
            )}
          </div>
        )}

        {/* Error review section */}
        {needsReview.length > 0 && (
          <div className="text-left space-y-2">
            <button
              onClick={() => setShowErrorReview(!showErrorReview)}
              className="flex items-center gap-2 w-full"
            >
              {showErrorReview ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Revue des erreurs ({needsReview.length})
              </p>
            </button>

            {showErrorReview && (
              <div className="space-y-2">
                {needsReview.map((a, i) => {
                  const config = RESULT_CONFIG[a.result];
                  const Icon = config.icon;
                  const isExpanded = expandedError === `${a.entity_id}-${i}`;
                  return (
                    <div
                      key={`${a.entity_id}-${i}`}
                      className={`bg-card border ${config.border} rounded-xl overflow-hidden`}
                    >
                      <button
                        onClick={() => setExpandedError(isExpanded ? null : `${a.entity_id}-${i}`)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                      >
                        <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
                        <span className="text-sm text-foreground flex-1 truncate">
                          {a.entity_name || "Entité"}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-3 space-y-2 border-t border-border pt-2">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Question</p>
                            <p className="text-xs text-foreground mt-0.5">{a.question_text}</p>
                          </div>
                          {a.user_answer && (
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ta réponse</p>
                              <p className="text-xs text-foreground mt-0.5">{a.user_answer}</p>
                            </div>
                          )}
                          {a.feedback && (
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ce qui manquait</p>
                              <p className="text-xs text-foreground mt-0.5">{a.feedback}</p>
                            </div>
                          )}
                          <Link
                            href={`/brief/${a.entity_id}`}
                            className="flex items-center gap-1.5 text-xs text-teal hover:underline mt-1"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            Voir le brief
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Claude analysis */}
        {needsReview.length > 0 && (
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
                {analyzing ? "Analyse en cours..." : "Analyser mes erreurs avec Claude"}
              </button>
            )}
          </div>
        )}

        {/* Entity-by-entity breakdown */}
        {answers.length > 0 && (
          <div className="text-left space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Détail par entité
            </p>
            <div className="space-y-2">
              {Array.from(entityResults.values()).map((a) => {
                const config = RESULT_CONFIG[a.result];
                const Icon = config.icon;
                return (
                  <Link
                    key={a.entity_id}
                    href={`/brief/${a.entity_id}`}
                    className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:border-teal/40 transition-colors"
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
                    <span className="text-sm text-foreground flex-1 truncate">
                      {a.entity_name || (a.question_text.length > 50
                        ? a.question_text.substring(0, 50) + "..."
                        : a.question_text)}
                    </span>
                    <BookOpen className="w-4 h-4 text-teal flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Coaching message */}
        {needsReview.length > 0 && !analysis && (
          <p className="text-xs text-muted-foreground">
            {needsReview.length === total
              ? "Pas de panique — les pré-tests froids servent à activer l'apprentissage. Consulte les briefs pour étudier."
              : `${needsReview.length} entité${needsReview.length > 1 ? "s" : ""} à consolider. Consulte les briefs pour renforcer.`}
          </p>
        )}

        {/* Post-session actions */}
        <div className="space-y-3">
          {isLongSession && total >= 10 && (
            <Link
              href="/weekly"
              className="flex items-center justify-center gap-2 w-full h-12 bg-teal/10 border border-teal/20 rounded-xl text-sm font-medium text-teal hover:bg-teal/20 transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              Voir l&apos;analyse de la semaine
            </Link>
          )}

          <Link
            href="/history"
            className="flex items-center justify-center gap-2 w-full h-12 bg-card border border-border rounded-xl text-sm text-foreground hover:border-teal/50 transition-colors"
          >
            <Clock className="w-4 h-4" />
            Historique complet
          </Link>

          <Button
            onClick={onReturn}
            className="w-full h-14 bg-teal hover:bg-teal-light text-white font-semibold"
          >
            Retour au tableau de bord
          </Button>
        </div>
      </div>
    </div>
  );
}

function resultPriority(result: string): number {
  if (result === "wrong") return 2;
  if (result === "partial") return 1;
  return 0;
}
