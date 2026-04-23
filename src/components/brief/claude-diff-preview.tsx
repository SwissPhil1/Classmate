"use client";

import { useMemo, useState } from "react";
import { Check, X as XIcon, Pencil, AlertTriangle } from "lucide-react";

interface Props {
  before: string;
  after: string;
  /** Claude's self-estimated share of lines changed, 0..1. Anything above
   *  0.4 is flagged as a large-scale rewrite and the user gets a warning. */
  changedRatio?: number;
  onAccept: (finalContent: string) => void;
  onReject: () => void;
}

/**
 * Inline diff-preview for any Claude-driven brief change (merge or regen).
 * Before being persisted, the proposed content is shown side-by-side with the
 * current content. The user can accept, reject, or edit inline before commit.
 *
 * Linear convention: never write to the DB without the user seeing the diff.
 */
export function ClaudeDiffPreview({ before, after, changedRatio, onAccept, onReject }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(after);
  const [view, setView] = useState<"after" | "before" | "split">("split");

  const diffLines = useMemo(() => computeLineDiff(before, after), [before, after]);

  const isLargeChange = typeof changedRatio === "number" && changedRatio > 0.4;

  return (
    <div className="bg-card border border-teal/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Aperçu de la modification proposée
        </h3>
        {typeof changedRatio === "number" && (
          <span
            className={`text-[10px] uppercase tracking-wider ${
              isLargeChange ? "text-amber" : "text-muted-foreground"
            }`}
          >
            {Math.round(changedRatio * 100)}% modifié
          </span>
        )}
      </div>

      {isLargeChange && (
        <div className="flex items-start gap-2 bg-amber/10 border border-amber/30 rounded-lg p-2 text-xs text-foreground">
          <AlertTriangle className="w-3.5 h-3.5 text-amber flex-shrink-0 mt-0.5" />
          <span>
            Modification importante. Relis attentivement avant d'accepter — une
            réécriture aussi large peut effacer tes éditions manuelles.
          </span>
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-background rounded-lg p-0.5 w-fit">
        {(["before", "split", "after"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`text-xs px-3 py-1 rounded-md transition-colors ${
              view === v
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v === "before" ? "Avant" : v === "split" ? "Diff" : "Après"}
          </button>
        ))}
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full min-h-[40vh] bg-background border border-border rounded-lg p-3 text-xs text-foreground font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-teal/30"
        />
      ) : view === "before" ? (
        <pre className="bg-background border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap max-h-[40vh] overflow-auto font-mono leading-relaxed">
          {before}
        </pre>
      ) : view === "after" ? (
        <pre className="bg-background border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap max-h-[40vh] overflow-auto font-mono leading-relaxed">
          {draft}
        </pre>
      ) : (
        <div className="bg-background border border-border rounded-lg p-3 text-xs font-mono leading-relaxed max-h-[40vh] overflow-auto">
          {diffLines.map((line, i) => (
            <div
              key={i}
              className={
                line.kind === "added"
                  ? "bg-correct/15 text-correct"
                  : line.kind === "removed"
                  ? "bg-wrong/15 text-wrong line-through"
                  : "text-muted-foreground"
              }
            >
              <span className="select-none opacity-50 mr-2">
                {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
              </span>
              {line.text || " "}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => onAccept(draft)}
          className="flex-1 flex items-center justify-center gap-1.5 h-9 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-light transition-colors"
        >
          <Check className="w-4 h-4" />
          Accepter
        </button>
        <button
          onClick={() => setEditing((e) => !e)}
          className="flex items-center gap-1.5 h-9 px-3 bg-card border border-border text-foreground rounded-lg text-xs hover:bg-background/50 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          {editing ? "Fermer l'éditeur" : "Éditer"}
        </button>
        <button
          onClick={onReject}
          className="flex items-center gap-1.5 h-9 px-3 bg-card border border-border text-muted-foreground rounded-lg text-xs hover:text-wrong hover:border-wrong/30 transition-colors"
        >
          <XIcon className="w-3.5 h-3.5" />
          Rejeter
        </button>
      </div>
    </div>
  );
}

interface DiffLine {
  kind: "added" | "removed" | "context";
  text: string;
}

/**
 * Simple line-level diff: lines present in both → context; only in `before` →
 * removed; only in `after` → added. No classic LCS alignment because for
 * markdown briefs this is both cheap and readable enough.
 */
function computeLineDiff(before: string, after: string): DiffLine[] {
  const aLines = before.split("\n");
  const bLines = after.split("\n");
  const aSet = new Set(aLines.map((l) => l.trim()).filter(Boolean));
  const bSet = new Set(bLines.map((l) => l.trim()).filter(Boolean));

  const result: DiffLine[] = [];
  let aIdx = 0;
  let bIdx = 0;
  while (aIdx < aLines.length || bIdx < bLines.length) {
    const aLine = aLines[aIdx];
    const bLine = bLines[bIdx];
    if (aLine === bLine) {
      result.push({ kind: "context", text: aLine ?? "" });
      aIdx++;
      bIdx++;
    } else if (aLine !== undefined && !bSet.has(aLine.trim())) {
      result.push({ kind: "removed", text: aLine });
      aIdx++;
    } else if (bLine !== undefined && !aSet.has(bLine.trim())) {
      result.push({ kind: "added", text: bLine });
      bIdx++;
    } else {
      // Fallback when both sides have the line but at different positions —
      // treat both as context to avoid flapping.
      if (aLine !== undefined) {
        result.push({ kind: "context", text: aLine });
        aIdx++;
      }
      if (bLine !== undefined && bLine !== aLine) {
        result.push({ kind: "context", text: bLine });
        bIdx++;
      }
    }
  }
  return result;
}
