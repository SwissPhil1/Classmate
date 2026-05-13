"use client";

import { useState } from "react";
import { Zap, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { setEntityPriority } from "@/lib/supabase/queries";
import type { Entity, Priority, PrioritySource } from "@/lib/types";

interface PinToDrillButtonProps {
  entity: Pick<Entity, "id" | "priority">;
  /** Optional: parent state update so the button reflects the new priority. */
  onPinned?: (patch: { priority: Priority; priority_source: PrioritySource }) => void;
  variant?: "default" | "compact";
}

/**
 * Promote an entity to priority='vital' with priority_source='manual' so it
 * surfaces in the daily drill. Idempotent — once pinned, the button shows a
 * confirmation state and is disabled.
 */
export function PinToDrillButton({ entity, onPinned, variant = "default" }: PinToDrillButtonProps) {
  const supabase = createClient();
  const [pinned, setPinned] = useState(entity.priority === "vital");
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (pinned || busy) return;
    setBusy(true);
    try {
      await setEntityPriority(supabase, entity.id, "vital", "manual");
      setPinned(true);
      onPinned?.({ priority: "vital", priority_source: "manual" });
      toast.success("Ajouté au drill rapide");
    } catch (err) {
      console.error("Pin to drill error:", err);
      toast.error(
        err instanceof Error ? `Erreur: ${err.message}` : "Erreur lors de l'épinglage"
      );
    } finally {
      setBusy(false);
    }
  };

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handle}
        disabled={pinned || busy}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
          pinned
            ? "bg-amber/10 text-amber border border-amber/30"
            : "bg-card border border-border text-muted-foreground hover:text-foreground"
        } disabled:opacity-70`}
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : pinned ? (
          <Check className="w-3 h-3" />
        ) : (
          <Zap className="w-3 h-3" />
        )}
        {pinned ? "Dans le drill" : "Épingler au drill"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pinned || busy}
      className={`w-full h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors ${
        pinned
          ? "bg-amber/10 border border-amber/30 text-amber"
          : "bg-card border border-border text-foreground hover:bg-muted"
      } disabled:opacity-70`}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : pinned ? (
        <Check className="w-4 h-4" />
      ) : (
        <Zap className="w-4 h-4" />
      )}
      {pinned ? "Déjà dans le drill rapide" : "Épingler au drill rapide"}
    </button>
  );
}
