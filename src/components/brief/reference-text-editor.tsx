"use client";

import { useState, useMemo } from "react";
import { Trash2, Sparkles, ChevronDown, ChevronRight, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ReferenceTextEditorProps {
  entityName: string;
  referenceText: string | null;
  onSave: (text: string | null) => Promise<void>;
}

export function ReferenceTextEditor({
  entityName,
  referenceText,
  onSave,
}: ReferenceTextEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(referenceText || "");
  const [saving, setSaving] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [consolidatedPreview, setConsolidatedPreview] = useState<string | null>(null);

  const sections = useMemo(() => {
    if (!referenceText) return [];
    return referenceText.split(/\n\n--- AJOUT ---\n/).map((s, i) => ({
      id: i,
      text: s.trim(),
    }));
  }, [referenceText]);

  const hasMultipleSections = sections.length > 1;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(editText.trim() || null);
      setEditing(false);
      toast.success("Texte de référence sauvegardé");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSection = async (sectionIndex: number) => {
    const newSections = sections.filter((_, i) => i !== sectionIndex);
    if (newSections.length === 0) {
      await onSave(null);
    } else {
      const newText = newSections.map((s) => s.text).join("\n\n--- AJOUT ---\n");
      await onSave(newText);
    }
    toast.success("Section supprimée");
  };

  const handleConsolidate = async () => {
    if (!referenceText) return;
    setConsolidating(true);
    try {
      const res = await fetch("/api/claude/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_name: entityName,
          reference_text: referenceText,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setConsolidatedPreview(data.consolidated_text);
    } catch {
      toast.error("Erreur lors de la consolidation");
    } finally {
      setConsolidating(false);
    }
  };

  const handleAcceptConsolidation = async () => {
    if (!consolidatedPreview) return;
    setSaving(true);
    try {
      await onSave(consolidatedPreview);
      setConsolidatedPreview(null);
      toast.success("Texte consolidé sauvegardé");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  if (!referenceText && !editing) {
    return (
      <div className="mt-6">
        <button
          onClick={() => { setEditing(true); setEditText(""); }}
          className="text-sm text-teal hover:underline"
        >
          + Ajouter du texte de référence
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Texte de référence
        </h2>
        {hasMultipleSections && (
          <span className="text-xs bg-amber/10 text-amber px-2 py-0.5 rounded-full">
            {sections.length} sections
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Consolidation preview */}
          {consolidatedPreview && (
            <div className="bg-teal/5 border border-teal/20 rounded-lg p-4 space-y-3">
              <p className="text-xs font-medium text-teal">Aperçu du texte consolidé</p>
              <pre className="text-xs text-foreground whitespace-pre-wrap max-h-60 overflow-y-auto bg-background rounded-lg p-3">
                {consolidatedPreview}
              </pre>
              <div className="flex gap-2">
                <Button
                  onClick={handleAcceptConsolidation}
                  disabled={saving}
                  className="flex-1 h-9 bg-teal hover:bg-teal-light text-white text-xs"
                >
                  {saving ? "Sauvegarde..." : "Accepter"}
                </Button>
                <Button
                  onClick={() => setConsolidatedPreview(null)}
                  variant="outline"
                  className="flex-1 h-9 text-xs"
                >
                  Rejeter
                </Button>
              </div>
            </div>
          )}

          {/* Edit mode */}
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full min-h-[200px] bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground resize-y"
                placeholder="Collez ici le contenu de référence..."
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 h-9 bg-teal hover:bg-teal-light text-white text-xs"
                >
                  {saving ? "Sauvegarde..." : "Sauvegarder"}
                </Button>
                <Button
                  onClick={() => { setEditing(false); setEditText(referenceText || ""); }}
                  variant="outline"
                  className="flex-1 h-9 text-xs"
                >
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Section view */}
              {hasMultipleSections ? (
                <div className="space-y-2">
                  {sections.map((section, i) => (
                    <div
                      key={section.id}
                      className="bg-background border border-border rounded-lg p-3 relative group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            {i === 0 ? "Original" : `Ajout ${i}`}
                          </span>
                          <p className="text-xs text-foreground mt-1 whitespace-pre-wrap line-clamp-4">
                            {section.text}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteSection(i)}
                          className="p-1.5 rounded hover:bg-wrong/10 text-muted-foreground hover:text-wrong transition-colors opacity-0 group-hover:opacity-100"
                          title="Supprimer cette section"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="text-xs text-foreground whitespace-pre-wrap bg-background border border-border rounded-lg p-3 max-h-40 overflow-y-auto">
                  {referenceText}
                </pre>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditing(true); setEditText(referenceText || ""); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-card border border-border rounded-lg transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Modifier
                </button>
                {hasMultipleSections && !consolidatedPreview && (
                  <button
                    onClick={handleConsolidate}
                    disabled={consolidating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-teal hover:text-teal-light bg-teal/5 border border-teal/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {consolidating ? "Consolidation..." : "Consolider avec Claude"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
