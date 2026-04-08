"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SessionType } from "@/lib/types";
import { ChevronDown } from "lucide-react";

interface TodayQueueProps {
  dueCount: number;
  pretestCount: number;
  onStartSession: (type: SessionType, topicId?: string) => void;
}

const SESSION_OPTIONS: { value: SessionType; label: string }[] = [
  { value: "short", label: "Courte session" },
  { value: "weekend", label: "Session weekend" },
  { value: "topic_study", label: "Étude par thème" },
  { value: "weekly_review", label: "Révision hebdomadaire" },
  { value: "monthly_review", label: "Révision mensuelle" },
];

export function TodayQueue({
  dueCount,
  pretestCount,
  onStartSession,
}: TodayQueueProps) {
  const [selectedType, setSelectedType] = useState<SessionType>("short");
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          {dueCount > 0
            ? `${dueCount} carte${dueCount > 1 ? "s" : ""} due${dueCount > 1 ? "s" : ""} aujourd'hui`
            : "Aucune carte due aujourd'hui"}
        </h2>
        {pretestCount > 0 && (
          <div className="inline-flex items-center gap-1.5 bg-amber/10 text-amber px-3 py-1 rounded-full text-sm font-medium">
            <span className="w-2 h-2 bg-amber rounded-full" />
            {pretestCount} pré-test{pretestCount > 1 ? "s" : ""} en attente
          </div>
        )}
      </div>

      {/* Session type selector */}
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="w-full flex items-center justify-between bg-background border border-border rounded-lg px-4 py-3 text-sm text-foreground hover:border-teal transition-colors"
        >
          <span>
            {SESSION_OPTIONS.find((o) => o.value === selectedType)?.label}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${showDropdown ? "rotate-180" : ""}`}
          />
        </button>

        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg overflow-hidden z-10 shadow-lg">
            {SESSION_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setSelectedType(option.value);
                  setShowDropdown(false);
                }}
                className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-background transition-colors"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Button
        onClick={() => onStartSession(selectedType)}
        disabled={dueCount === 0 && pretestCount === 0}
        className="w-full h-14 bg-teal hover:bg-teal-light text-white font-semibold text-base"
      >
        Commencer la session
      </Button>
    </div>
  );
}
