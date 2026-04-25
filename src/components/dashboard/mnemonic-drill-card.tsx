"use client";

import { useEffect, useState, useCallback } from "react";
import { Sparkles, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { countMnemonicEntities, getMnemonicEntities } from "@/lib/supabase/queries";
import { DailyDrill } from "./daily-drill";
import type { Entity } from "@/lib/types";

/**
 * On-demand mnemonic drill — pulls every entity with a recognized mnemonic
 * regardless of next_test_date, so the user can drill MMTs whenever they want
 * (the daily drill only surfaces what's due today).
 *
 * Lazy: only loads the count at mount; the full entity list (with brief joins)
 * is fetched when the user expands the card.
 */
export function MnemonicDrillCard() {
  const supabase = createClient();
  const { user } = useUser();
  const [count, setCount] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<Entity[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCount = useCallback(async () => {
    if (!user) return;
    try {
      const n = await countMnemonicEntities(supabase, user.id);
      setCount(n);
    } catch (err) {
      console.error("countMnemonicEntities error:", err);
      setCount(0);
    }
  }, [supabase, user]);

  useEffect(() => {
    void loadCount();
  }, [loadCount]);

  const expand = async () => {
    if (!user) return;
    setExpanded(true);
    if (items === null) {
      setLoading(true);
      try {
        const entities = await getMnemonicEntities(supabase, user.id, 50);
        setItems(entities);
      } catch (err) {
        console.error("getMnemonicEntities error:", err);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const collapse = () => {
    setExpanded(false);
  };

  if (!user) return null;
  if (count === null) return null;
  if (count === 0) return null;

  return (
    <div className="space-y-3">
      {!expanded ? (
        <button
          type="button"
          onClick={expand}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-card border border-amber/30 rounded-xl hover:bg-muted transition-colors"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber" />
            <span className="text-sm font-semibold text-foreground">
              Drill mnémoniques
            </span>
            <span className="text-xs text-muted-foreground">
              {count} entité{count > 1 ? "s" : ""}
            </span>
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={collapse}
            className="w-full flex items-center justify-between gap-3 px-4 py-2 bg-card border border-amber/30 rounded-xl hover:bg-muted transition-colors"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber" />
              <span className="text-sm font-medium text-foreground">
                Drill mnémoniques · {items?.length ?? 0}
              </span>
            </span>
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          </button>

          {loading && (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Chargement…
            </div>
          )}

          {!loading && items && items.length > 0 && (
            <DailyDrill items={items} onCompleted={() => void loadCount()} />
          )}

          {!loading && items && items.length === 0 && (
            <div className="px-4 py-6 bg-card border border-border rounded-xl text-center text-sm text-muted-foreground">
              Aucune entité à mnémonique pour l&apos;instant.
            </div>
          )}
        </>
      )}
    </div>
  );
}
