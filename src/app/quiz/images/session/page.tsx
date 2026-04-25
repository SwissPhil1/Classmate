"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Eye, X, Check, AlertCircle, RefreshCw, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getImagesForQuiz, upsertImageReviewState, type ImageQuizItem } from "@/lib/supabase/queries";
import { getImageUrl } from "@/lib/supabase/storage";
import { calculateNextReview } from "@/lib/spaced-repetition";
import type { ImageModality, TestResult, DifficultyLevel } from "@/lib/types";

type SrsMode = "due" | "new" | "all";
type RunMode = "standard" | "blitz";

const BLITZ_REVEAL_DELAY_MS = 10_000; // auto-reveal after 10s

export default function QuizImagesSessionPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <QuizSessionInner />
    </Suspense>
  );
}

function QuizSessionInner() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const { user, loading: userLoading } = useUser();

  const topicId = params.get("topic") || null;
  const chapterId = params.get("chapter") || null;
  const modality = (params.get("modality") as ImageModality | null) || null;
  const srsMode = (params.get("mode") as SrsMode) || "due";
  const runMode = (params.get("run") as RunMode) || "standard";
  const count = parseInt(params.get("count") || "25", 10);

  const [queue, setQueue] = useState<ImageQuizItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const blitzTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  // Load the queue once.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const items = await getImagesForQuiz(supabase, user.id, {
          topic_id: topicId,
          chapter_id: chapterId,
          modality,
          srs_mode: srsMode,
          limit: count,
        });
        if (cancelled) return;
        // Attach signed URLs (private bucket).
        const withUrls = await Promise.all(
          items.map(async (it) => ({
            ...it,
            image: { ...it.image, url: await getImageUrl(supabase, it.image.storage_path) },
          }))
        );
        setQueue(withUrls);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setLoadError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const current = queue && queue[index];

  // Blitz: auto-reveal after the timer.
  useEffect(() => {
    if (runMode !== "blitz" || !current || revealed) return;
    blitzTimerRef.current = setTimeout(() => setRevealed(true), BLITZ_REVEAL_DELAY_MS);
    return () => {
      if (blitzTimerRef.current) clearTimeout(blitzTimerRef.current);
    };
  }, [runMode, current, revealed]);

  const grade = async (result: TestResult) => {
    if (!current || !user) return;
    if (blitzTimerRef.current) clearTimeout(blitzTimerRef.current);

    // Map the image's review_state into a calculateNextReview()-compatible shape.
    const state = current.review;
    const update = calculateNextReview(
      {
        correct_streak: state?.correct_streak ?? 0,
        difficulty_level: (state?.difficulty_level ?? 2) as DifficultyLevel,
        status: state?.status ?? "new",
        cycle_count: state?.cycle_count ?? 0,
        last_tested: state?.last_reviewed ?? null,
      },
      result
    );

    try {
      await upsertImageReviewState(supabase, {
        image_id: current.image.id,
        user_id: user.id,
        correct_streak: update.correct_streak,
        difficulty_level: update.difficulty_level,
        cycle_count: update.cycle_count,
        status: update.status,
        next_review_date: update.next_test_date,
        last_reviewed: update.last_tested,
        total_reviews: (state?.total_reviews ?? 0) + 1,
      });
    } catch (err) {
      console.error("upsertImageReviewState error:", err);
    }

    setResults((prev) => [...prev, result]);
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  // Done?
  const done = queue !== null && index >= queue.length;

  if (userLoading || !user) return <LoadingScreen />;
  if (loadError) {
    return (
      <ErrorScreen
        message={loadError}
        onRetry={() => router.refresh()}
        backHref="/quiz/images"
      />
    );
  }
  if (queue === null) return <LoadingScreen label="Chargement de la session…" />;
  if (queue.length === 0) {
    return (
      <EmptyScreen
        message="Aucune image ne correspond à ces filtres (ou aucune n'a encore été analysée par Claude)."
        backHref="/quiz/images"
      />
    );
  }
  if (done) {
    return <SessionRecap queue={queue} results={results} />;
  }

  const progress = `${index + 1} / ${queue.length}`;
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Link
          href="/quiz/images"
          className="p-2 -m-2 hover:bg-muted rounded-lg transition-colors"
          aria-label="Quitter"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </Link>
        <div className="text-xs font-medium text-muted-foreground tabular-nums">{progress}</div>
        {runMode === "blitz" && !revealed && (
          <BlitzCountdown key={current?.image.id} ms={BLITZ_REVEAL_DELAY_MS} />
        )}
        {(runMode !== "blitz" || revealed) && <div className="w-12" />}
      </header>

      {/* Image area */}
      <div className="flex-1 flex flex-col">
        {current && (
          <ImageStage
            key={current.image.id}
            item={current}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
            runMode={runMode}
          />
        )}
      </div>

      {/* Grade actions */}
      {revealed && current && (
        <GradeBar onGrade={grade} />
      )}
      {!revealed && current && runMode === "standard" && (
        <div className="px-4 pb-6">
          <button
            onClick={() => setRevealed(true)}
            className="w-full h-12 flex items-center justify-center gap-2 bg-teal hover:bg-teal-light text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <Eye className="w-4 h-4" /> Voir la réponse
          </button>
        </div>
      )}
    </div>
  );
}

function ImageStage({
  item,
  revealed,
  onReveal,
  runMode,
}: {
  item: ImageQuizItem;
  revealed: boolean;
  onReveal: () => void;
  runMode: RunMode;
}) {
  const { image, review } = item;
  const brief = image.ai_brief;
  const ctxLabel = [image.topic_name, image.chapter_name].filter(Boolean).join(" · ");

  return (
    <div className="flex-1 flex flex-col">
      {/* Image — taps to reveal in standard mode */}
      <button
        onClick={runMode === "standard" && !revealed ? onReveal : undefined}
        className="flex-1 flex items-center justify-center bg-black p-2"
      >
        <img
          src={image.url || ""}
          alt={image.display_name || "Image radiologique"}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      </button>

      {/* Reveal panel */}
      <AnimatePresence>
        {revealed && brief && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            className="bg-card border-t border-border max-h-[55vh] overflow-y-auto"
          >
            <div className="px-4 py-3 space-y-3">
              {ctxLabel && (
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {ctxLabel}
                </p>
              )}
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-teal mt-0.5 shrink-0" />
                <h2 className="text-base font-semibold text-foreground leading-tight">
                  {brief.diagnostic_likely}
                </h2>
              </div>

              {brief.semiologic_findings.length > 0 && (
                <Block label="Sémiologie">
                  <ul className="space-y-1 text-sm text-foreground">
                    {brief.semiologic_findings.map((f, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-teal">·</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}

              {brief.top_3_ddx.length > 0 && (
                <Block label="Top 3 DDx">
                  <ol className="space-y-1.5 text-sm text-foreground">
                    {brief.top_3_ddx.map((d, i) => (
                      <li key={i} className="leading-snug">
                        <span className="font-medium">{i + 1}. {d.dx}</span>
                        <span className="text-muted-foreground"> — {d.distinguishing_feature}</span>
                      </li>
                    ))}
                  </ol>
                </Block>
              )}

              {brief.pitfalls.length > 0 && (
                <Block label="Pièges">
                  <ul className="space-y-1 text-sm text-foreground">
                    {brief.pitfalls.map((p, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-amber-500">!</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}

              {review && (
                <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                  Streak {review.correct_streak}/4 · Difficulté {review.difficulty_level} · Vues {review.total_reviews}
                </p>
              )}
            </div>
          </motion.div>
        )}
        {revealed && !brief && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="bg-card border-t border-border px-4 py-6"
          >
            <p className="text-sm text-muted-foreground italic text-center">
              Pas de brief disponible pour cette image.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      {children}
    </div>
  );
}

function GradeBar({ onGrade }: { onGrade: (r: TestResult) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 px-4 pb-6 pt-2 border-t border-border">
      <button
        onClick={() => onGrade("wrong")}
        className="h-12 flex items-center justify-center gap-1.5 bg-wrong/10 border border-wrong/20 text-wrong rounded-lg text-sm font-semibold hover:bg-wrong/20 transition-colors"
      >
        <X className="w-4 h-4" /> Faux
      </button>
      <button
        onClick={() => onGrade("partial")}
        className="h-12 flex items-center justify-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-lg text-sm font-semibold hover:bg-amber-500/20 transition-colors"
      >
        <AlertCircle className="w-4 h-4" /> Partiel
      </button>
      <button
        onClick={() => onGrade("correct")}
        className="h-12 flex items-center justify-center gap-1.5 bg-correct/10 border border-correct/20 text-correct rounded-lg text-sm font-semibold hover:bg-correct/20 transition-colors"
      >
        <Check className="w-4 h-4" /> Juste
      </button>
    </div>
  );
}

function BlitzCountdown({ ms }: { ms: number }) {
  const [remaining, setRemaining] = useState(ms);
  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const left = Math.max(0, ms - (Date.now() - start));
      setRemaining(left);
      if (left === 0) clearInterval(tick);
    }, 100);
    return () => clearInterval(tick);
  }, [ms]);
  const seconds = Math.ceil(remaining / 1000);
  return (
    <div className="flex items-center gap-1 text-amber-500 text-xs font-semibold tabular-nums">
      <Zap className="w-3.5 h-3.5" />
      {seconds}s
    </div>
  );
}

function SessionRecap({ queue, results }: { queue: ImageQuizItem[]; results: TestResult[] }) {
  const stats = useMemo(() => {
    const c = results.filter((r) => r === "correct").length;
    const p = results.filter((r) => r === "partial").length;
    const w = results.filter((r) => r === "wrong").length;
    return { c, p, w };
  }, [results]);
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Session terminée</h2>
        <p className="text-sm text-muted-foreground">
          {queue.length} image{queue.length > 1 ? "s" : ""} parcourue{queue.length > 1 ? "s" : ""}.
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Juste" value={stats.c} className="text-correct" />
          <Stat label="Partiel" value={stats.p} className="text-amber-500" />
          <Stat label="Faux" value={stats.w} className="text-wrong" />
        </div>
        <div className="flex gap-2">
          <Link
            href="/quiz/images"
            className="flex-1 h-11 flex items-center justify-center bg-card border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Nouvelle session
          </Link>
          <Link
            href="/dashboard"
            className="flex-1 h-11 flex items-center justify-center bg-teal hover:bg-teal-light text-white rounded-lg text-sm font-medium transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={`p-3 bg-background border border-border rounded-lg ${className || ""}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function LoadingScreen({ label = "Chargement..." }: { label?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyScreen({ message, backHref }: { message: string; backHref: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-sm space-y-4 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-teal hover:text-teal-light"
        >
          <ArrowLeft className="w-4 h-4" /> Modifier les filtres
        </Link>
      </div>
    </div>
  );
}

function ErrorScreen({
  message,
  onRetry,
  backHref,
}: {
  message: string;
  onRetry: () => void;
  backHref: string;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-sm space-y-4 text-center">
        <p className="text-sm text-wrong">{message}</p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 text-sm text-teal hover:text-teal-light"
          >
            <RefreshCw className="w-4 h-4" /> Réessayer
          </button>
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Configuration
          </Link>
        </div>
      </div>
    </div>
  );
}
