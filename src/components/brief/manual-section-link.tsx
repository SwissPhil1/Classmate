"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Link2, Unlink, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { parseSections } from "@/lib/brief-parsing";

interface Props {
  chapterId: string;
  chapterName: string;
  manualContent: string | null | undefined;
  currentAnchor: string | null;
  onChange: (anchor: string | null) => Promise<void>;
}

/**
 * Dropdown to link / unlink an entity to a `## Section` inside its chapter's
 * `manual_content`. Rendered on the brief page above the reference-text
 * editor. When the chapter has no manual yet, shows a CTA to go create one.
 */
export function ManualSectionLink({
  chapterId,
  chapterName,
  manualContent,
  currentAnchor,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const sections = useMemo(() => {
    if (!manualContent || !manualContent.trim()) return [];
    return parseSections(manualContent)
      .filter((s) => s.title && s.content.trim().length > 0)
      .map((s) => s.title);
  }, [manualContent]);

  const noManual = !manualContent || sections.length === 0;

  const setAnchor = async (anchor: string | null) => {
    if (saving) return;
    setSaving(true);
    try {
      await onChange(anchor);
      toast.success(anchor ? `Lié à « ${anchor} »` : "Lien retiré");
      setOpen(false);
    } catch (err) {
      console.error("Link section error:", err);
      toast.error("Modification impossible");
    } finally {
      setSaving(false);
    }
  };

  if (noManual) {
    return (
      <div className="bg-card border border-border rounded-xl p-3 flex items-start gap-3">
        <BookOpen className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Aucun manuel pour le chapitre <span className="text-foreground">{chapterName}</span>. Crée un manuel pour y lier cette entité et enrichir son brief.
          </p>
        </div>
        <Link
          href={`/chapters/${chapterId}/manual`}
          className="text-xs text-teal hover:text-teal-light flex-shrink-0"
        >
          Créer →
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-card border border-teal/20 rounded-xl p-3 space-y-2">
      <div className="flex items-start gap-3">
        <Link2 className="w-4 h-4 text-teal flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {currentAnchor ? (
            <>
              <p className="text-xs text-muted-foreground">Section liée</p>
              <p className="text-sm font-medium text-foreground truncate">
                {currentAnchor}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Section du manuel</p>
              <p className="text-sm text-foreground">Non lié</p>
            </>
          )}
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={saving}
          className="flex items-center gap-1 text-xs text-teal hover:text-teal-light disabled:opacity-50 flex-shrink-0"
        >
          {currentAnchor ? "Changer" : "Lier"}
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="border-t border-border pt-2 max-h-64 overflow-y-auto space-y-0.5">
          {currentAnchor && (
            <button
              onClick={() => setAnchor(null)}
              disabled={saving}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-wrong hover:bg-wrong/5 disabled:opacity-50"
            >
              <Unlink className="w-3 h-3" />
              Retirer le lien
            </button>
          )}
          {sections.map((title) => {
            const isCurrent = title === currentAnchor;
            return (
              <button
                key={title}
                onClick={() => !isCurrent && setAnchor(title)}
                disabled={saving || isCurrent}
                className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors ${
                  isCurrent
                    ? "bg-teal/10 text-teal cursor-default"
                    : "text-foreground hover:bg-background/50"
                }`}
              >
                <span className="truncate">{title}</span>
                {isCurrent && <Check className="w-3 h-3 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
