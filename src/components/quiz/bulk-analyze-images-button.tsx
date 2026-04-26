"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getPendingImages } from "@/lib/supabase/queries";

const CONCURRENCY = 3;

interface BulkAnalyzeImagesButtonProps {
  /** Optional: callback fired when the bulk run finishes (recap toast already shown). */
  onCompleted?: () => void;
}

/**
 * Backfill button — analyzes all of the user's images currently in
 * ai_brief_status pending|error by calling /api/claude/analyze-image
 * concurrently from the browser. Self-hides when there's nothing to do.
 */
export function BulkAnalyzeImagesButton({ onCompleted }: BulkAnalyzeImagesButtonProps) {
  const supabase = createClient();
  const { user } = useUser();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });
  const cancelledRef = useRef(false);

  const refreshCount = useCallback(async () => {
    if (!user) return;
    try {
      const pending = await getPendingImages(supabase, user.id);
      setPendingCount(pending.length);
    } catch (err) {
      console.error("getPendingImages error:", err);
      setPendingCount(0);
    }
  }, [supabase, user]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  const run = useCallback(async () => {
    if (!user || running) return;
    setRunning(true);
    cancelledRef.current = false;
    try {
      const pending = await getPendingImages(supabase, user.id);
      const total = pending.length;
      if (total === 0) {
        setRunning(false);
        return;
      }
      setProgress({ done: 0, total, errors: 0 });

      let cursor = 0;
      let done = 0;
      let errors = 0;

      const worker = async () => {
        while (cursor < pending.length) {
          if (cancelledRef.current) return;
          const idx = cursor++;
          const img = pending[idx];
          try {
            const res = await fetch("/api/claude/analyze-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image_id: img.id }),
            });
            if (!res.ok) errors++;
          } catch {
            errors++;
          } finally {
            done++;
            setProgress({ done, total, errors });
          }
        }
      };

      const workers: Promise<void>[] = [];
      for (let i = 0; i < Math.min(CONCURRENCY, pending.length); i++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      if (errors === 0) {
        toast.success(`${total} images analysées`);
      } else {
        toast.message(`${total - errors}/${total} analysées · ${errors} échecs`);
      }
      await refreshCount();
      onCompleted?.();
    } finally {
      setRunning(false);
      setProgress({ done: 0, total: 0, errors: 0 });
    }
  }, [user, running, supabase, refreshCount, onCompleted]);

  if (!user) return null;
  if (pendingCount === null) return null;
  if (pendingCount === 0 && !running) return null;

  return (
    <button
      type="button"
      onClick={run}
      disabled={running}
      className="w-full h-11 flex items-center justify-center gap-2 bg-amber/10 border border-amber/30 text-amber rounded-lg text-sm font-medium hover:bg-amber/20 transition-colors disabled:opacity-70"
    >
      {running ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {progress.total > 0
            ? `Analyse… ${progress.done} / ${progress.total}${progress.errors ? ` · ${progress.errors} err` : ""}`
            : "Analyse…"}
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4" />
          Analyser {pendingCount} image{pendingCount > 1 ? "s" : ""} en attente
        </>
      )}
    </button>
  );
}
