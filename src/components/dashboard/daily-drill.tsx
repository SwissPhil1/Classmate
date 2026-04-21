"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Zap, Check, X as XIcon, Pencil, ThumbsDown, ChevronRight, RotateCcw, EyeOff } from "lucide-react";
import type { Entity } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { createTestResult, updateEntity, setEntityPriority } from "@/lib/supabase/queries";
import { calculateNextReview } from "@/lib/spaced-repetition";

interface DailyDrillProps {
  items: Entity[];
  onCompleted?: () => void;
}

/**
 * Flashcard-style daily drill for vital entities (mnemonics + "can't miss"
 * diagnostics). Keyboard: Space=reveal, J=known, K=forgotten, H=retirer du drill,
 * E=edit brief, D=thumbs-down (rewrite mnemonic).
 */
export function DailyDrill({ items, onCompleted }: DailyDrillProps) {
  const supabase = createClient();
  const [queue, setQueue] = useState<Entity[]>(items);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  // Total reflects the live queue, so removals immediately update the counter.
  const total = queue.length;

  // Reset if parent items change
  useEffect(() => {
    setQueue(items);
    setIdx(0);
    setRevealed(false);
  }, [items]);

  const current = queue[idx] ?? null;
  const done = idx >= queue.length;
  const mnemonicBody = useMemo(
    () => (current ? extractMnemonicBody(current) : null),
    [current]
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
        advance();
      } catch (err) {
        console.error("Drill answer error:", err);
        toast.error("Impossible d'enregistrer, réessaye.");
      } finally {
        processingRef.current = false;
        setProcessing(false);
      }
    },
    [current, supabase, advance]
  );

  const removeFromDrill = useCallback(async () => {
    if (!current || processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    try {
      await setEntityPriority(supabase, current.id, "normal", "manual");
      // Pop the current entity from the local queue and keep the same idx,
      // which now points at what used to be the next card.
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

  // Keyboard shortcuts
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Ignore if user is typing in an input/textarea
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
    return (
      <div className="bg-card border border-amber/30 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber" />
          <h2 className="text-sm font-semibold text-foreground">Drill terminé</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {total} carte{total > 1 ? "s" : ""} revue{total > 1 ? "s" : ""} aujourd&apos;hui.
        </p>
        {onCompleted && (
          <button
            onClick={() => onCompleted()}
            className="flex items-center gap-1.5 text-xs text-teal hover:text-teal-light transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Actualiser
          </button>
        )}
      </div>
    );
  }

  if (!current) return null;

  const progress = Math.round((idx / total) * 100);

  return (
    <div className="bg-card border border-amber/30 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber" />
          <h2 className="text-sm font-semibold text-foreground">
            Drill du jour · {idx + 1}/{total}
          </h2>
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          vital
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-amber transition-all" style={{ width: `${progress}%` }} />
      </div>

      {/* Card */}
      <div className="bg-background border border-border rounded-xl p-5 min-h-[140px] flex flex-col justify-center gap-3">
        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground">{current.chapter?.name ?? ""}</p>
          <p className="text-lg font-semibold text-foreground">{current.name}</p>
          {current.has_mnemonic && current.mnemonic_name && (
            <p className="text-2xl font-bold text-amber tracking-wide mt-2">
              {current.mnemonic_name}
            </p>
          )}
        </div>

        {revealed && mnemonicBody && (
          <div className="mt-2 bg-card border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap max-h-48 overflow-auto">
            {mnemonicBody}
          </div>
        )}
      </div>

      {/* Reveal hint */}
      {!revealed && (
        <button
          onClick={() => setRevealed(true)}
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {mnemonicBody ? "Révéler (Espace)" : "Espace pour afficher le rappel"}
        </button>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => answer("wrong")}
          disabled={processing}
          className="flex items-center justify-center gap-1.5 h-11 bg-wrong/10 border border-wrong/20 text-wrong rounded-lg text-sm font-medium hover:bg-wrong/20 transition-colors disabled:opacity-50"
        >
          <XIcon className="w-4 h-4" />
          Oublié <span className="text-[10px] opacity-60 ml-1">K</span>
        </button>
        <button
          onClick={() => answer("correct")}
          disabled={processing}
          className="flex items-center justify-center gap-1.5 h-11 bg-correct/10 border border-correct/20 text-correct rounded-lg text-sm font-medium hover:bg-correct/20 transition-colors disabled:opacity-50"
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

/**
 * Extract a ~400-char snippet from the brief to show on card flip. Prefers the
 * "## Mnémonique" section if present, otherwise falls back to "## Perles" or
 * "## Vue d'ensemble".
 */
function extractMnemonicBody(entity: Entity): string | null {
  const content = entity.brief?.content;
  if (!content) return null;
  const preferred = [/mn[ée]moni[qQ]ue/i, /perle/i, /vue d['’]ensemble/i];
  for (const re of preferred) {
    const snippet = extractSection(content, re);
    if (snippet) return snippet.length > 400 ? snippet.substring(0, 400).trim() + "…" : snippet;
  }
  return null;
}

function extractSection(markdown: string, headerPattern: RegExp): string | null {
  const lines = markdown.split("\n");
  let capturing = false;
  const buf: string[] = [];
  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (capturing) break;
      if (headerPattern.test(line)) {
        capturing = true;
        continue;
      }
    } else if (capturing) {
      buf.push(line);
    }
  }
  const text = buf.join("\n").trim();
  return text.length > 0 ? text : null;
}
