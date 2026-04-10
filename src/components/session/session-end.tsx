"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import type { AnswerRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Check, AlertTriangle, XCircle, BookOpen } from "lucide-react";
import Link from "next/link";

interface SessionEndProps {
  answers: AnswerRecord[];
  onReturn: () => void;
}

const RESULT_CONFIG = {
  correct: { icon: Check, color: "text-correct", bg: "bg-correct/10", border: "border-correct/20", label: "Correct" },
  partial: { icon: AlertTriangle, color: "text-partial", bg: "bg-partial/10", border: "border-partial/20", label: "Partiel" },
  wrong: { icon: XCircle, color: "text-wrong", bg: "bg-wrong/10", border: "border-wrong/20", label: "Incorrect" },
};

export function SessionEnd({ answers, onReturn }: SessionEndProps) {
  const correct = answers.filter((a) => a.result === "correct").length;
  const partial = answers.filter((a) => a.result === "partial").length;
  const wrong = answers.filter((a) => a.result === "wrong").length;
  const total = answers.length;
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

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

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Session terminée
          </h1>
          <p className="text-muted-foreground">
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
                  <div
                    key={a.entity_id}
                    className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3"
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
                    <span className="text-sm text-foreground flex-1 truncate">
                      {a.question_text.length > 50
                        ? a.question_text.substring(0, 50) + "..."
                        : a.question_text}
                    </span>
                    <Link
                      href={`/brief/${a.entity_id}`}
                      className="p-1.5 rounded-lg hover:bg-background transition-colors flex-shrink-0"
                    >
                      <BookOpen className="w-4 h-4 text-teal" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Coaching message */}
        {needsReview.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {needsReview.length === total
              ? "Pas de panique — les pré-tests froids servent à activer l'apprentissage. Consulte les briefs pour étudier."
              : `${needsReview.length} entité${needsReview.length > 1 ? "s" : ""} à consolider. Consulte les briefs pour renforcer.`}
          </p>
        )}

        <Button
          onClick={onReturn}
          className="w-full h-14 bg-teal hover:bg-teal-light text-white font-semibold"
        >
          Retour au tableau de bord
        </Button>
      </div>
    </div>
  );
}

function resultPriority(result: string): number {
  if (result === "wrong") return 2;
  if (result === "partial") return 1;
  return 0;
}
