"use client";

import { Plus } from "lucide-react";

interface QuickAddButtonProps {
  onClick: () => void;
}

export function QuickAddButton({ onClick }: QuickAddButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-0 left-1/2 -translate-x-1/2 safe-bottom-fab z-50 w-14 h-14 bg-teal hover:bg-teal-light rounded-full shadow-lg shadow-teal/20 flex items-center justify-center transition-all active:scale-95"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      aria-label="Ajouter une entité"
    >
      <Plus className="w-6 h-6 text-white" />
    </button>
  );
}
