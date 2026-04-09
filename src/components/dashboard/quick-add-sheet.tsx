"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import {
  getTopics,
  getChapters,
  getSources,
  createSource,
  createEntity,
} from "@/lib/supabase/queries";
import type { Topic, Chapter, Source, EntityType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { toast } from "sonner";

interface QuickAddSheetProps {
  open: boolean;
  onClose: () => void;
}

const ENTITY_TYPE_OPTIONS: { value: EntityType; label: string }[] = [
  { value: "single_diagnosis", label: "Diagnostic" },
  { value: "ddx_pair", label: "DDx" },
  { value: "concept", label: "Concept" },
  { value: "protocol", label: "Protocole" },
];

export function QuickAddSheet({ open, onClose }: QuickAddSheetProps) {
  const { user } = useUser();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("single_diagnosis");
  const [topicId, setTopicId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [customSourceName, setCustomSourceName] = useState("");
  const [showCustomSource, setShowCustomSource] = useState(false);
  const [referenceText, setReferenceText] = useState("");
  const [showReference, setShowReference] = useState(false);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const [t, s] = await Promise.all([
        getTopics(supabase),
        getSources(supabase),
      ]);
      setTopics(t);
      setSources(s);
      if (t.length > 0 && !topicId) setTopicId(t[0].id);
    };
    load();
  }, [open]);

  useEffect(() => {
    if (!topicId) return;
    getChapters(supabase, topicId).then((c) => {
      setChapters(c);
      if (c.length > 0) setChapterId(c[0].id);
    });
  }, [topicId]);

  const handleSourceChange = (val: string) => {
    if (val === "__custom__") {
      setShowCustomSource(true);
      setSourceId("");
    } else {
      setShowCustomSource(false);
      setSourceId(val);
    }
  };

  const handleSubmit = async () => {
    if (!user || !name.trim() || !chapterId) return;
    setSubmitting(true);

    try {
      let finalSourceId = sourceId;

      // Create custom source if needed
      if (showCustomSource && customSourceName.trim()) {
        const newSource = await createSource(supabase, customSourceName.trim());
        finalSourceId = newSource.id;
        setSources((prev) => [...prev, newSource]);
      }

      await createEntity(supabase, {
        user_id: user.id,
        chapter_id: chapterId,
        name: name.trim(),
        entity_type: entityType,
        source_id: finalSourceId,
        reference_text: referenceText.trim() || null,
      });

      toast.success("Entité ajoutée — pré-test demain matin");

      // Reset form
      setName("");
      setEntityType("single_diagnosis");
      setShowCustomSource(false);
      setCustomSourceName("");
      setReferenceText("");
      setShowReference(false);
      onClose();
    } catch (err) {
      console.error("Quick add error:", err);
      toast.error("Erreur lors de l'ajout");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="p-5 space-y-4 safe-bottom">
              {/* Handle & close */}
              <div className="flex items-center justify-between">
                <div className="w-10 h-1 bg-border rounded-full mx-auto" />
                <button
                  onClick={onClose}
                  className="absolute right-4 top-4 p-2 rounded-lg hover:bg-background"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <h2 className="text-lg font-semibold text-foreground">
                Ajouter une entité
              </h2>

              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Nom</label>
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: Médulloblastome vs épendymome"
                  className="h-12 bg-background border-border"
                />
              </div>

              {/* Entity Type */}
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Type</label>
                <div className="flex flex-wrap gap-2">
                  {ENTITY_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setEntityType(opt.value)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        entityType === opt.value
                          ? "bg-teal text-white"
                          : "bg-background border border-border text-foreground hover:border-teal/50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Topic */}
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Thème</label>
                <select
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                  className="w-full h-12 bg-background border border-border rounded-lg px-3 text-sm text-foreground"
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference text (Top 3, etc.) */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setShowReference(!showReference)}
                  className="text-sm text-teal hover:underline"
                >
                  {showReference ? "− Masquer le texte de référence" : "+ Ajouter du texte de référence (Top 3, etc.)"}
                </button>
                {showReference && (
                  <textarea
                    value={referenceText}
                    onChange={(e) => setReferenceText(e.target.value)}
                    placeholder="Collez ici le contenu du livre (DDx, perles, diagnostic...)"
                    rows={6}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground resize-y"
                  />
                )}
              </div>

              {/* Source */}
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Source</label>
                <select
                  value={showCustomSource ? "__custom__" : sourceId}
                  onChange={(e) => handleSourceChange(e.target.value)}
                  className="w-full h-12 bg-background border border-border rounded-lg px-3 text-sm text-foreground"
                >
                  <option value="">Sélectionner...</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="__custom__">+ Ajouter une source</option>
                </select>

                {showCustomSource && (
                  <Input
                    autoFocus
                    value={customSourceName}
                    onChange={(e) => setCustomSourceName(e.target.value)}
                    placeholder="Nom de la source"
                    className="h-12 bg-background border-border mt-2"
                  />
                )}
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={!name.trim() || !chapterId || submitting}
                className="w-full h-14 bg-teal hover:bg-teal-light text-white font-semibold"
              >
                {submitting ? "Ajout en cours..." : "Ajouter"}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
