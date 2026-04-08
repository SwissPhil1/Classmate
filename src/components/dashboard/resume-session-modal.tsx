"use client";

import { Button } from "@/components/ui/button";

interface ResumeSessionModalProps {
  sessionId: string;
  onResume: () => void;
  onAbandon: () => void;
}

export function ResumeSessionModal({
  onResume,
  onAbandon,
}: ResumeSessionModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          Reprendre la session ?
        </h2>
        <p className="text-sm text-muted-foreground">
          Vous avez une session en cours non terminée. Voulez-vous la reprendre
          ou commencer une nouvelle session ?
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onAbandon}
            className="flex-1 h-12 border-border"
          >
            Abandonner
          </Button>
          <Button
            onClick={onResume}
            className="flex-1 h-12 bg-teal hover:bg-teal-light text-white"
          >
            Reprendre
          </Button>
        </div>
      </div>
    </div>
  );
}
