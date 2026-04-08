"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Shuffle, X } from "lucide-react";

export function InterleavingNudge() {
  const { settings, updateSettings } = useSettings();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!settings) return;
    if (settings.interleaving_enabled) return;
    if (settings.interleaving_suggested) return;

    // Check if 14 days have passed since week_start_date
    if (settings.week_start_date) {
      const start = new Date(settings.week_start_date);
      const now = new Date();
      const daysPassed = Math.floor(
        (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysPassed >= 14) {
        setShow(true);
      }
    }
  }, [settings]);

  const handleEnable = () => {
    updateSettings({
      interleaving_enabled: true,
      interleaving_suggested: true,
    });
    setShow(false);
  };

  const handleDismiss = () => {
    updateSettings({ interleaving_suggested: true });
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="bg-teal/10 border border-teal/20 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Shuffle className="w-5 h-5 text-teal shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            Activer le mode interleaving ?
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Mélanger les thèmes pendant les sessions améliore significativement
            la rétention à long terme. Recommandé après 2 semaines d'étude.
          </p>
        </div>
        <button onClick={handleDismiss} className="p-1">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex gap-2 ml-8">
        <Button
          onClick={handleDismiss}
          variant="outline"
          size="sm"
          className="border-border text-xs"
        >
          Plus tard
        </Button>
        <Button
          onClick={handleEnable}
          size="sm"
          className="bg-teal hover:bg-teal-light text-white text-xs"
        >
          Activer
        </Button>
      </div>
    </div>
  );
}
