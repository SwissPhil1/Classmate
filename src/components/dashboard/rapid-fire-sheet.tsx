"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getTopics } from "@/lib/supabase/queries";
import type { Topic } from "@/lib/types";

interface RapidFireSheetProps {
  open: boolean;
  onClose: () => void;
}

const COUNT_OPTIONS = [10, 20, 30] as const;
type Mode = "due" | "all";

export function RapidFireSheet({ open, onClose }: RapidFireSheetProps) {
  const router = useRouter();
  const supabase = createClient();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState<string>("");
  const [count, setCount] = useState<number>(20);
  const [mode, setMode] = useState<Mode>("all");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getTopics(supabase).then((t) => {
      if (cancelled) return;
      setTopics(t);
      setTopicId((current) => current || (t[0]?.id ?? ""));
    });
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  const launch = () => {
    if (!topicId) return;
    const params = new URLSearchParams({
      type: "topic_study",
      topic: topicId,
      count: String(count),
      ...(mode === "all" ? { mode: "all" } : {}),
    });
    router.push(`/session?${params.toString()}`);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) onClose();
            }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="p-5 space-y-5 safe-bottom">
              <div className="flex items-center justify-between">
                <div className="w-10 h-1 bg-border rounded-full mx-auto" />
                <button
                  onClick={onClose}
                  className="absolute right-4 top-4 p-2 rounded-lg hover:bg-background"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-teal" />
                  <h2 className="text-lg font-semibold text-foreground">Rapid Fire</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Drill rapide sur un thème, sans attendre les dates de révision.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Thème</label>
                <select
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                  className="w-full h-12 px-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-teal"
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Nombre de questions</label>
                <div className="flex gap-2">
                  {COUNT_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={`flex-1 h-12 rounded-lg text-sm font-medium transition-colors ${
                        count === n
                          ? "bg-teal text-white"
                          : "bg-background border border-border text-foreground hover:border-teal/50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Sélection</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMode("all")}
                    className={`flex-1 h-12 rounded-lg text-sm font-medium transition-colors ${
                      mode === "all"
                        ? "bg-teal text-white"
                        : "bg-background border border-border text-foreground hover:border-teal/50"
                    }`}
                  >
                    Toutes les entités
                  </button>
                  <button
                    onClick={() => setMode("due")}
                    className={`flex-1 h-12 rounded-lg text-sm font-medium transition-colors ${
                      mode === "due"
                        ? "bg-teal text-white"
                        : "bg-background border border-border text-foreground hover:border-teal/50"
                    }`}
                  >
                    Dues seulement
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {mode === "all"
                    ? "Inclut les entités dont la prochaine date n'est pas encore arrivée."
                    : "N'utilise que les entités dont la prochaine révision est due."}
                </p>
              </div>

              <button
                onClick={launch}
                disabled={!topicId}
                className="w-full h-12 bg-teal text-white rounded-lg font-medium hover:bg-teal/90 transition-colors disabled:opacity-50"
              >
                Lancer la session
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
