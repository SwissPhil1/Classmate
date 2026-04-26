"use client";

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import type { Entity, QuestionType, TestResult, ImageModality } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, AlertTriangle, XCircle, StickyNote, ImagePlus, Loader2, Flag } from "lucide-react";
import { ImageGallery } from "@/components/ui/image-gallery";
import type { EntityImage } from "@/lib/types";

interface SessionQuestionProps {
  entity: Entity;
  question: {
    type: QuestionType;
    question: string;
    model_answer: string;
    key_points: string[];
    image_urls?: string[];
  };
  isPretest: boolean;
  onAnswer: (result: TestResult, userAnswer: string | null, feedback?: string, confidence?: number) => void;
  onSaveNote?: (entityId: string, note: string) => void;
  onSaveImage?: (entityId: string, file: File) => Promise<void>;
  onReportError?: (entityId: string) => void;
}

export function SessionQuestion({
  entity,
  question,
  isPretest,
  onReportError,
  onAnswer,
  onSaveNote,
  onSaveImage,
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
  const [confidence, setConfidence] = useState<number | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageAdded, setImageAdded] = useState(false);
  const [reported, setReported] = useState(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const isTyped = question.type === "A_typed" || question.type === "C_freeresponse";
  const isOpen = question.type === "B_open";

  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 2) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (res.ok || res.status < 500) return res;
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
        return res;
      } catch (err) {
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Max retries exceeded");
  };

  const handleSubmitTyped = async () => {
    if (!userAnswer.trim()) return;
    setSubmitted(true);
    setEvaluating(true);

    try {
      const res = await fetchWithRetry("/api/claude/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_name: entity.name,
          question: question.question,
          model_answer: question.model_answer,
          key_points: question.key_points,
          user_answer: userAnswer,
          question_type: question.type,
          notes: entity.notes,
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
    onAnswer(result, isOpen ? null : userAnswer, evaluation?.feedback, confidence ?? undefined);
  };

  const handleNext = () => {
    if (evaluation) {
      handleNoteSave();
      onAnswer(evaluation.result, userAnswer, evaluation.feedback, confidence ?? undefined);
    }
  };

  const handleNoteSave = () => {
    if (onSaveNote && noteText !== (entity.notes || "")) {
      onSaveNote(entity.id, noteText);
    }
  };

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onSaveImage) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image trop volumineuse (max 5 Mo)");
      return;
    }
    setImageUploading(true);
    try {
      await onSaveImage(entity.id, file);
      setImageAdded(true);
    } catch {
      // Error handled by parent
    } finally {
      setImageUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }, [entity.id, onSaveImage]);

  const ImageUploadButton = () => (
    onSaveImage ? (
      <div className="flex items-center gap-2">
        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={imageUploading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {imageUploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ImagePlus className="w-3.5 h-3.5" />
          )}
          {imageUploading ? "Upload..." : imageAdded ? "Image ajoutée ✓" : "Ajouter une image"}
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>
    ) : null
  );

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
          <span className="text-xs bg-amber/10 text-amber px-2 py-1 rounded-full font-medium" role="status">
            Pré-test
          </span>
        </div>
      )}

      {/* Entity name */}
      <h3 className="text-sm font-medium text-muted-foreground mb-1">
        {entity.name}
      </h3>

      {/* Entity images */}
      {question.image_urls && question.image_urls.length > 0 && (
        <div className="mb-3">
          <ImageGallery
            images={question.image_urls.map((url, i) => ({
              id: `session-img-${i}`,
              entity_id: entity.id,
              user_id: entity.user_id,
              storage_path: "",
              caption: null,
              modality: null,
              display_order: i,
              created_at: "",
              display_name: null,
              tags: [],
              sequence: null,
              source_url: null,
              width: null,
              height: null,
              file_size_bytes: null,
              is_cover: false,
              url,
            } satisfies EntityImage))}
            compact={false}
          />
        </div>
      )}

      {/* Question */}
      <div className="bg-card border border-border rounded-xl p-5 mb-4" role="region" aria-label="Question">
        <p className="text-foreground leading-relaxed">{question.question}</p>
      </div>

      {/* Answer area */}
      {!submitted ? (
        <div className="space-y-3 mt-auto">
          {isTyped ? (
            <>
              <Textarea
                ref={answerRef}
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                onFocus={() => {
                  // Auto-scroll textarea into view on mobile
                  setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
                }}
                placeholder={
                  question.type === "C_freeresponse"
                    ? "Rédigez votre réponse complète..."
                    : "Votre réponse..."
                }
                className="min-h-[120px] bg-card border-border resize-none"
                rows={question.type === "C_freeresponse" ? 8 : 4}
                aria-label="Votre réponse"
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
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setNoteOpen(true)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <StickyNote className="w-3.5 h-3.5" />
                    {entity.notes ? "Modifier ma note" : "Ajouter une note"}
                  </button>
                  <ImageUploadButton />
                  {onReportError && (
                    <button
                      onClick={() => { onReportError(entity.id); setReported(true); }}
                      disabled={reported}
                      className={`flex items-center gap-1.5 text-xs transition-colors ${reported ? "text-wrong" : "text-muted-foreground hover:text-wrong"}`}
                    >
                      <Flag className="w-3.5 h-3.5" />
                      {reported ? "Signalé ✓" : "Signaler erreur"}
                    </button>
                  )}
                </div>
              )}

              {/* Confidence rating */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Confiance dans ma réponse:</p>
                <div className="flex gap-2" role="group" aria-label="Niveau de confiance">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      onClick={() => setConfidence(level)}
                      aria-label={`Confiance ${level} sur 5`}
                      aria-pressed={confidence === level}
                      className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                        confidence === level
                          ? "bg-teal text-white"
                          : "bg-background border border-border text-muted-foreground hover:border-teal/50"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                  <span>Deviné</span>
                  <span>Certain</span>
                </div>
              </div>

              <Button
                onClick={handleNext}
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
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setNoteOpen(true)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <StickyNote className="w-3.5 h-3.5" />
                    {entity.notes ? "Modifier ma note" : "Ajouter une note"}
                  </button>
                  <ImageUploadButton />
                  {onReportError && (
                    <button
                      onClick={() => { onReportError(entity.id); setReported(true); }}
                      disabled={reported}
                      className={`flex items-center gap-1.5 text-xs transition-colors ${reported ? "text-wrong" : "text-muted-foreground hover:text-wrong"}`}
                    >
                      <Flag className="w-3.5 h-3.5" />
                      {reported ? "Signalé ✓" : "Signaler erreur"}
                    </button>
                  )}
                </div>
              )}

              {/* Confidence rating */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Confiance dans ma réponse:</p>
                <div className="flex gap-2" role="group" aria-label="Niveau de confiance">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      onClick={() => setConfidence(level)}
                      aria-label={`Confiance ${level} sur 5`}
                      aria-pressed={confidence === level}
                      className={`flex-1 h-9 rounded-lg text-xs font-medium transition-colors ${
                        confidence === level
                          ? "bg-teal text-white"
                          : "bg-background border border-border text-muted-foreground hover:border-teal/50"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                  <span>Deviné</span>
                  <span>Certain</span>
                </div>
              </div>

              {/* Self-flag buttons */}
              <div className="space-y-2" role="group" aria-label="Auto-évaluation de votre réponse">
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
                        aria-label={`Marquer comme ${labels[result].toLowerCase()}`}
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
