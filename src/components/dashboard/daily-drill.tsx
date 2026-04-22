"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Zap,
  Check,
  X as XIcon,
  Pencil,
  ThumbsDown,
  ChevronRight,
  RotateCcw,
  EyeOff,
  Eye,
  Sparkles,
  Target,
  Lightbulb,
} from "lucide-react";
import type { Entity } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { createTestResult, updateEntity, setEntityPriority } from "@/lib/supabase/queries";
import { calculateNextReview } from "@/lib/spaced-repetition";
import { extractDrillReveal, extractRawMnemonicBody, type DrillReveal } from "@/lib/brief-parsing";

interface DailyDrillProps {
  items: Entity[];
  onCompleted?: () => void;
}

interface SessionResults {
  known: string[];
  forgotten: string[];
}

/**
 * Flashcard-style daily drill for vital entities (mnemonics + "can't miss"
 * diagnostics). Keyboard: Space=reveal, J=known, K=forgotten, H=retirer du drill.
 * Touch-friendly: prominent reveal button above the J/K actions.
 */
export function DailyDrill({ items, onCompleted }: DailyDrillProps) {
  const supabase = createClient();
  const [mnemonicsOnly, setMnemonicsOnly] = useState(false);
  const filteredItems = useMemo(
    () => (mnemonicsOnly ? items.filter((e) => e.has_mnemonic) : items),
    [items, mnemonicsOnly]
  );
  const mnemonicItemCount = useMemo(() => items.filter((e) => e.has_mnemonic).length, [items]);
  const [queue, setQueue] = useState<Entity[]>(filteredItems);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<SessionResults>({ known: [], forgotten: [] });
  const [isRetry, setIsRetry] = useState(false);
  const processingRef = useRef(false);
  const total = queue.length;

  // Reset if parent items change OR filter toggles
  useEffect(() => {
    setQueue(filteredItems);
    setIdx(0);
    setRevealed(false);
    setResults({ known: [], forgotten: [] });
    setIsRetry(false);
  }, [filteredItems]);

  const current = queue[idx] ?? null;
  const done = idx >= queue.length;

  const reveal = useMemo<DrillReveal | null>(
    () => (current ? extractDrillReveal(current) : null),
    [current]
  );
  const fallbackBody = useMemo(
    () => (current && !reveal ? extractRawMnemonicBody(current) : null),
    [current, reveal]
  );

  const advance = useCallback(() => {
    setIdx((prev) => prev + 1);
    setRevealed(false);
  }, []);

  const answer = useCallback(
    async (result: "correct" | "wrong") => {
      if (!current || processingRef.current) return;
      processingRef.current = true;
      setProcessing(true);
      try {
        // In retry mode we only refresh local tracking — no new test_result, no
        // SRS update. The forgotten cards already have an SRS entry from the
        // first pass; a second-pass booster shouldn't double-count.
        if (!isRetry) {
          const update = calculateNextReview(
            {
              correct_streak: current.correct_streak,
              difficulty_level: current.difficulty_level,
              status: current.status,
              cycle_count: current.cycle_count,
              last_tested: current.last_tested,
              priority: current.priority,
            },
            result
          );
          await Promise.all([
            createTestResult(supabase, {
              entity_id: current.id,
              session_id: null,
              question_text: `Drill mnémo / vital: ${current.name}`,
              question_type: "B_open",
              user_answer: null,
              result,
              auto_evaluated: false,
              feedback: null,
              is_pretest: false,
              interleaved_session: false,
            }),
            updateEntity(supabase, current.id, update),
          ]);
        }
        const entityId = current.id;
        setResults((prev) => {
          const next: SessionResults = {
            known: prev.known.filter((id) => id !== entityId),
            forgotten: prev.forgotten.filter((id) => id !== entityId),
          };
          if (result === "correct") next.known.push(entityId);
          else next.forgotten.push(entityId);
          return next;
        });
        advance();
      } catch (err) {
        console.error("Drill answer error:", err);
        toast.error("Impossible d'enregistrer, réessaye.");
      } finally {
        processingRef.current = false;
        setProcessing(false);
      }
    },
    [current, supabase, advance, isRetry]
  );

  const removeFromDrill = useCallback(async () => {
    if (!current || processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    try {
      await setEntityPriority(supabase, current.id, "normal", "manual");
      const removedId = current.id;
      setQueue((q) => q.filter((e) => e.id !== removedId));
      setRevealed(false);
      toast.success("Retiré du drill");
    } catch (err) {
      console.error("Drill remove error:", err);
      toast.error("Impossible de retirer la carte.");
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, [current, supabase]);

  const retryForgotten = useCallback(() => {
    const forgottenIds = new Set(results.forgotten);
    const forgottenCards = items.filter((e) => forgottenIds.has(e.id));
    if (forgottenCards.length === 0) return;
    setQueue(forgottenCards);
    setIdx(0);
    setRevealed(false);
    setResults({ known: [], forgotten: [] });
    setIsRetry(true);
  }, [items, results.forgotten]);

  // Keyboard shortcuts
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setRevealed((r) => !r);
      } else if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        void answer("correct");
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        void answer("wrong");
      } else if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        void removeFromDrill();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, answer, removeFromDrill]);

  if (total === 0) return null;

  if (done) {
    const knownCount = results.known.length;
    const forgottenCount = results.forgotten.length;
    const graded = knownCount + forgottenCount;
    const pct = graded > 0 ? Math.round((knownCount / graded) * 100) : 0;
    const forgottenEntities = items.filter((e) => results.forgotten.includes(e.id));

    return (
      <div className="bg-card border border-amber/30 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber" />
          <h2 className="text-sm font-semibold text-foreground">
            {isRetry ? "Révision terminée" : "Drill terminé"}
          </h2>
        </div>

        {graded > 0 ? (
          <>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-foreground">
                  {knownCount}/{graded}
                </span>
                <span className="text-xs text-muted-foreground">
                  {pct}% connus
                </span>
              </div>
              <div className="h-1.5 bg-border rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-correct"
                  style={{ width: `${(knownCount / graded) * 100}%` }}
                />
                <div
                  className="h-full bg-wrong"
                  style={{ width: `${(forgottenCount / graded) * 100}%` }}
                />
              </div>
            </div>

            {forgottenEntities.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  À revoir ({forgottenEntities.length})
                </p>
                <ul className="space-y-1">
                  {forgottenEntities.slice(0, 8).map((e) => (
                    <li key={e.id} className="text-xs text-foreground">
                      · {e.name}
                    </li>
                  ))}
                  {forgottenEntities.length > 8 && (
                    <li className="text-xs text-muted-foreground">
                      … et {forgottenEntities.length - 8} autres
                    </li>
                  )}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {total} carte{total > 1 ? "s" : ""} revue{total > 1 ? "s" : ""}.
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          {forgottenEntities.length > 0 && (
            <button
              onClick={retryForgotten}
              className="flex items-center justify-center gap-1.5 h-10 px-4 bg-amber/10 border border-amber/30 text-amber rounded-lg text-sm font-medium hover:bg-amber/20 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Revoir les oubliés ({forgottenEntities.length})
            </button>
          )}
          {onCompleted && (
            <button
              onClick={() => onCompleted()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Actualiser
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!current) return null;

  const progress = Math.round((idx / total) * 100);
  const hasAnyReveal = reveal !== null || fallbackBody !== null;
  const briefContent = Array.isArray(current.brief)
    ? (current.brief[0]?.content ?? null)
    : (current.brief?.content ?? null);
  const briefMissing = !briefContent || briefContent.trim().length === 0;

  return (
    <div className="bg-card border border-amber/30 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber" />
          <h2 className="text-sm font-semibold text-foreground">
            {isRetry ? "Révision" : "Drill du jour"} · {idx + 1}/{total}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {mnemonicItemCount > 0 && !isRetry && (
            <button
              onClick={() => setMnemonicsOnly((v) => !v)}
              className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full transition-colors ${
                mnemonicsOnly
                  ? "bg-amber/20 text-amber border border-amber/40"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
              title={mnemonicsOnly ? "Afficher tous les vitaux" : "Afficher seulement les mnémos"}
            >
              {mnemonicsOnly ? `Mnémos (${mnemonicItemCount})` : `Tout (${items.length})`}
            </button>
          )}
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            vital
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-amber transition-all" style={{ width: `${progress}%` }} />
      </div>

      {/* Card — tap anywhere to flip */}
      <button
        type="button"
        onClick={() => hasAnyReveal && setRevealed((r) => !r)}
        disabled={!hasAnyReveal}
        className={`w-full bg-background border rounded-xl p-5 min-h-[140px] flex flex-col justify-center gap-3 text-left transition-colors ${
          hasAnyReveal
            ? "border-border hover:border-teal/40 cursor-pointer"
            : "border-border cursor-default"
        }`}
      >
        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground">{current.chapter?.name ?? ""}</p>
          <p className="text-lg font-semibold text-foreground">{current.name}</p>
          {current.has_mnemonic && current.mnemonic_name && (
            <p className="text-2xl font-bold text-amber tracking-wide mt-2">
              {current.mnemonic_name}
            </p>
          )}
        </div>

        {revealed ? (
          reveal ? (
            <StructuredReveal reveal={reveal} />
          ) : fallbackBody ? (
            <div className="bg-card border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap max-h-48 overflow-auto">
              {fallbackBody}
            </div>
          ) : null
        ) : hasAnyReveal ? (
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-1">
            <Eye className="w-3.5 h-3.5" />
            Toucher la carte ou Espace pour révéler
          </div>
        ) : null}
      </button>

      {/* Actionable link when brief is missing/unreadable */}
      {!hasAnyReveal && (
        <Link
          href={`/brief/${current.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 h-10 border border-dashed border-wrong/30 rounded-lg text-sm text-wrong hover:bg-wrong/5 transition-colors"
        >
          <Eye className="w-4 h-4" />
          {briefMissing ? "Brief non généré — ouvrir" : "Brief illisible — ouvrir"}
        </Link>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => answer("wrong")}
          disabled={processing}
          className="flex items-center justify-center gap-1.5 h-12 bg-wrong/10 border border-wrong/20 text-wrong rounded-lg text-sm font-medium hover:bg-wrong/20 transition-colors disabled:opacity-50"
        >
          <XIcon className="w-4 h-4" />
          Oublié <span className="text-[10px] opacity-60 ml-1">K</span>
        </button>
        <button
          onClick={() => answer("correct")}
          disabled={processing}
          className="flex items-center justify-center gap-1.5 h-12 bg-correct/10 border border-correct/20 text-correct rounded-lg text-sm font-medium hover:bg-correct/20 transition-colors disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
          Connu <span className="text-[10px] opacity-60 ml-1">J</span>
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <Link
          href={`/brief/${current.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-teal transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Ouvrir le brief
          <ChevronRight className="w-3 h-3" />
        </Link>
        <button
          onClick={removeFromDrill}
          disabled={processing}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-amber transition-colors disabled:opacity-50"
          title="Retirer cette entité du drill (ne la re-taguera plus automatiquement)"
        >
          <EyeOff className="w-3.5 h-3.5" />
          Retirer <span className="text-[10px] opacity-60 ml-0.5">H</span>
        </button>
        {current.has_mnemonic && (
          <Link
            href={`/brief/${current.id}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-wrong transition-colors"
            title="Mnémonique peu utile — ouvre le brief pour la réécrire"
          >
            <ThumbsDown className="w-3.5 h-3.5" />
            Signaler
          </Link>
        )}
      </div>
    </div>
  );
}

function StructuredReveal({ reveal }: { reveal: DrillReveal }) {
  return (
    <div className="space-y-2">
      {reveal.mnemonicExpansion && reveal.mnemonicExpansion.length > 0 && (
        <RevealBlock
          icon={<Sparkles className="w-3.5 h-3.5 text-amber" />}
          label="Mnémonique"
        >
          <ul className="space-y-0.5">
            {reveal.mnemonicExpansion.map((line, i) => (
              <li key={i} className="text-xs text-foreground leading-relaxed">
                {line}
              </li>
            ))}
          </ul>
        </RevealBlock>
      )}
      {reveal.ddxTop3 && reveal.ddxTop3.length > 0 && (
        <RevealBlock
          icon={<Target className="w-3.5 h-3.5 text-teal" />}
          label="DDx clés"
        >
          <ul className="space-y-0.5">
            {reveal.ddxTop3.map((line, i) => (
              <li key={i} className="text-xs text-foreground leading-relaxed">
                · {line}
              </li>
            ))}
          </ul>
        </RevealBlock>
      )}
      {reveal.pearl && (
        <RevealBlock
          icon={<Lightbulb className="w-3.5 h-3.5 text-correct" />}
          label="Perle"
        >
          <p className="text-xs text-foreground leading-relaxed italic">
            « {reveal.pearl} »
          </p>
        </RevealBlock>
      )}
    </div>
  );
}

function RevealBlock({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background border border-border rounded-lg p-3 space-y-1.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}
