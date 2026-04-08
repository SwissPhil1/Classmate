"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import type { AnswerRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Check, AlertTriangle, XCircle } from "lucide-react";

interface SessionEndProps {
  answers: AnswerRecord[];
  onReturn: () => void;
}

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

  // Find entities to review tomorrow (wrong answers)
  const toReview = answers
    .filter((a) => a.result === "wrong")
    .map((a) => a.entity_id)
    .filter((id, i, arr) => arr.indexOf(id) === i);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Session terminée
          </h1>
          <p className="text-muted-foreground">
            {total} question{total > 1 ? "s" : ""} répondue{total > 1 ? "s" : ""}
          </p>
        </div>

        {/* Results breakdown */}
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-correct/10 border border-correct/20 rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <Check className="w-5 h-5 text-correct" />
              <span className="text-correct font-medium">Correct</span>
            </div>
            <span className="text-correct font-bold text-lg">{correct}</span>
          </div>

          <div className="flex items-center justify-between bg-partial/10 border border-partial/20 rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-partial" />
              <span className="text-partial font-medium">Partiel</span>
            </div>
            <span className="text-partial font-bold text-lg">{partial}</span>
          </div>

          <div className="flex items-center justify-between bg-wrong/10 border border-wrong/20 rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <XCircle className="w-5 h-5 text-wrong" />
              <span className="text-wrong font-medium">Incorrect</span>
            </div>
            <span className="text-wrong font-bold text-lg">{wrong}</span>
          </div>
        </div>

        {/* Entities to review */}
        {toReview.length > 0 && (
          <div className="text-left bg-card border border-border rounded-xl p-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Entités à revoir demain
            </p>
            <ul className="space-y-1">
              {answers
                .filter((a) => a.result === "wrong")
                .map((a, i) => (
                  <li key={i} className="text-sm text-foreground">
                    • {a.question_text.substring(0, 60)}...
                  </li>
                ))}
            </ul>
          </div>
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
