"use client";

import { useEffect, useState } from "react";
import { X, Lightbulb } from "lucide-react";

interface ChapterWorkflowBannerProps {
  chapterId: string;
  hasManual: boolean;
}

/**
 * Pedagogical banner on the chapter manual page that reminds the user of the
 * 3-step workflow to lift a chapter to "Uro-genital quality": generate the
 * manual → link entities to sections → regenerate all briefs.
 *
 * Dismissible per chapter (localStorage). Re-appears on a different chapter
 * the user hasn't dismissed yet, so each chapter gets its own onboarding.
 */
export function ChapterWorkflowBanner({ chapterId, hasManual }: ChapterWorkflowBannerProps) {
  const storageKey = `dismiss-chapter-banner:${chapterId}`;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  if (dismissed) return null;

  const dismiss = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "1");
    }
    setDismissed(true);
  };

  return (
    <section className="bg-teal/5 border border-teal/20 rounded-xl p-4 relative">
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-3 right-3 p-1 hover:bg-teal/10 rounded transition-colors"
        aria-label="Masquer ce bandeau"
      >
        <X className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <Lightbulb className="w-5 h-5 text-teal mt-0.5 shrink-0" />
        {hasManual ? (
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">
              Manuel rédigé. Pour propager la qualité aux briefs :
            </h3>
            <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
              <li>Tap <span className="text-foreground font-medium">Lier les entités aux sections</span>.</li>
              <li>Tap <span className="text-foreground font-medium">Régénérer tous les briefs</span> (~10 min pour 20 entités).</li>
            </ol>
          </div>
        ) : (
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">
              Pour qu&apos;un chapitre ait la qualité d&apos;Uro-génital — 3 étapes :
            </h3>
            <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
              <li>Tap <span className="text-foreground font-medium">Générer le manuel avec Claude</span> (5-10 min).</li>
              <li>Tap <span className="text-foreground font-medium">Lier les entités aux sections</span>.</li>
              <li>Tap <span className="text-foreground font-medium">Régénérer tous les briefs</span> (~10 min pour 20 entités).</li>
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
