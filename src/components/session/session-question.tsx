"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Entity, QuestionType, TestResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, AlertTriangle, XCircle, StickyNote } from "lucide-react";

interface SessionQuestionProps {
  entity: Entity;
  question: {
    type: QuestionType;
    question: string;
    model_answer: string;
    key_points: string[];
  };
  isPretest: boolean;
  onAnswer: (result: TestResult, userAnswer: string | null, feedback?: string) => void;
  onSaveNote?: (entityId: string, note: string) => void;
}

export function SessionQuestion({
  entity,
  question,
  isPretest,
  onAnswer,
  onSaveNote,
}: SessionQuestionProps) {
  const [userAnswer, setUserAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<{
    result: TestResult;
    feedback: string;
    missing: string[];
    oral_tip: string | null;
  } | null>(null);
  const [selfFlagged, setSelfFlagged] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(entity.notes || "");

  const isTyped = question.type === "A_typed" || question.type === "C_freeresponse";
  const isOpen = question.type === "B_open";

  const handleSubmitTyped = async () => {
    if (!userAnswer.trim()) return;
    setSubmitted(true);
    setEvaluating(true);

    try {
      const res = await fetch("/api/claude/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_name: entity.name,
          question: question.question,
          model_answer: question.model_answer,
          key_points: question.key_points,
          user_answer: userAnswer,
          question_type: question.type,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEvaluation(data);
    } catch {
      // Fallback: let user self-evaluate
      setEvaluation(null);
      setSelfFlagged(true);
    } finally {
      setEvaluating(false);
    }
  };

  const handleReveal = () => {
    setSubmitted(true);
  };

  const handleSelfFlag = (result: TestResult) => {
    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
    handleNoteSave();
    onAnswer(result, isOpen ? null : userAnswer, evaluation?.feedback);
  };

  const handleNext = () => {
    if (evaluation) {
      onAnswer(evaluation.result, userAnswer, evaluation.feedback);
    }
  };

  const handleNoteSave = () => {
    if (onSaveNote && noteText !== (entity.notes || "")) {
      onSaveNote(entity.id, noteText);
    }
  };

  const RESULT_CONFIG = {
    correct: {
      icon: Check,
      color: "text-correct",
      bg: "bg-correct/10",
      border: "border-correct/30",
      label: "Correct",
    },
    partial: {
      icon: AlertTriangle,
      color: "text-partial",
      bg: "bg-partial/10",
      border: "border-partial/30",
      label: "Partiel",
    },
    wrong: {
      icon: XCircle,
      color: "text-wrong",
      bg: "bg-wrong/10",
      border: "border-wrong/30",
      label: "Incorrect",
    },
  };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 max-w-3xl mx-auto w-full">
      {/* Pre-test badge */}
      {isPretest && (
        <div className="mb-3">
          <span className="text-xs bg-amber/10 text-amber px-2 py-1 rounded-full font-medium">
            Pré-test
          </span>
        </div>
      )}

      {/* Entity name */}
      <h3 className="text-sm font-medium text-muted-foreground mb-1">
        {entity.name}
      </h3>

      {/* Question */}
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <p className="text-foreground leading-relaxed">{question.question}</p>
      </div>

      {/* Answer area */}
      {!submitted ? (
        <div className="space-y-3 mt-auto">
          {isTyped ? (
            <>
              <Textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder={
                  question.type === "C_freeresponse"
                    ? "Rédigez votre réponse complète..."
                    : "Votre réponse..."
                }
                className="min-h-[120px] bg-card border-border resize-none"
                rows={question.type === "C_freeresponse" ? 8 : 4}
              />
              <Button
                onClick={handleSubmitTyped}
                disabled={!userAnswer.trim()}
                className="w-full h-14 bg-teal hover:bg-teal-light text-white font-semibold"
              >
                Soumettre
              </Button>
            </>
          ) : (
            <Button
              onClick={handleReveal}
              className="w-full h-14 bg-teal hover:bg-teal-light text-white font-semibold"
            >
              Je suis prêt
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4 mt-auto">
          {/* Evaluation result */}
          {evaluating ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-teal border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-sm text-muted-foreground">
                Évaluation en cours...
              </span>
            </div>
          ) : evaluation && !selfFlagged ? (
            <div className="space-y-3">
              {/* Result badge */}
              <div
                className={`flex items-center gap-2 px-4 py-3 rounded-lg ${RESULT_CONFIG[evaluation.result].bg} border ${RESULT_CONFIG[evaluation.result].border}`}
              >
                {(() => {
                  const Icon = RESULT_CONFIG[evaluation.result].icon;
                  return (
                    <Icon
                      className={`w-5 h-5 ${RESULT_CONFIG[evaluation.result].color}`}
                    />
                  );
                })()}
                <span
                  className={`font-medium ${RESULT_CONFIG[evaluation.result].color}`}
                >
                  {RESULT_CONFIG[evaluation.result].label}
                </span>
              </div>

              {/* Model answer */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Réponse modèle
                </p>
                <p className="text-sm text-foreground leading-relaxed">
                  {question.model_answer}
                </p>
              </div>

              {/* Feedback */}
              <p className="text-sm text-foreground">{evaluation.feedback}</p>

              {/* Missing points */}
              {evaluation.missing.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Points manquants:
                  </p>
                  <ul className="text-sm text-wrong space-y-0.5">
                    {evaluation.missing.map((m, i) => (
                      <li key={i}>• {m}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Oral tip */}
              {evaluation.oral_tip && (
                <div className="bg-teal/5 border border-teal/20 rounded-lg p-3">
                  <p className="text-xs font-medium text-teal mb-1">
                    Conseil oral
                  </p>
                  <p className="text-sm text-foreground">
                    {evaluation.oral_tip}
                  </p>
                </div>
              )}

              {/* Note/correction */}
              {noteOpen ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Mes notes / corrections
                  </p>
                  <Textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onBlur={handleNoteSave}
                    placeholder="Corriger ou compléter la réponse..."
                    className="min-h-[80px] bg-card border-border resize-none text-sm"
                    rows={3}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setNoteOpen(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <StickyNote className="w-3.5 h-3.5" />
                  {entity.notes ? "Modifier ma note" : "Ajouter une note"}
                </button>
              )}

              <Button
                onClick={() => { handleNoteSave(); handleNext(); }}
                className="w-full h-14 bg-card border border-border text-foreground font-semibold hover:bg-background"
              >
                Suivant
              </Button>
            </div>
          ) : (
            // Self-flag mode (Format B or evaluation failure)
            <div className="space-y-4">
              {/* Model answer */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Réponse modèle
                </p>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                  {question.model_answer}
                </p>
              </div>

              {/* Note/correction */}
              {noteOpen ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Mes notes / corrections
                  </p>
                  <Textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onBlur={handleNoteSave}
                    placeholder="Corriger ou compléter la réponse..."
                    className="min-h-[80px] bg-card border-border resize-none text-sm"
                    rows={3}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setNoteOpen(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <StickyNote className="w-3.5 h-3.5" />
                  {entity.notes ? "Modifier ma note" : "Ajouter une note"}
                </button>
              )}

              {/* Self-flag buttons */}
              <div className="space-y-2">
                {(["correct", "partial", "wrong"] as TestResult[]).map(
                  (result) => {
                    const config = RESULT_CONFIG[result];
                    const Icon = config.icon;
                    const labels = {
                      correct: "Correct",
                      partial: "Partiel",
                      wrong: "Incorrect",
                    };
                    return (
                      <motion.button
                        key={result}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleSelfFlag(result)}
                        className={`w-full h-16 flex items-center justify-center gap-3 rounded-xl border ${config.border} ${config.bg} font-medium ${config.color} transition-colors`}
                      >
                        <Icon className="w-5 h-5" />
                        {labels[result]}
                      </motion.button>
                    );
                  }
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
