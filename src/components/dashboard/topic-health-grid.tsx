"use client";

import type { TopicHealth } from "@/lib/types";

interface TopicHealthGridProps {
  topics: TopicHealth[];
  onTopicClick: (topicId: string) => void;
}

const HEALTH_COLORS = {
  red: "bg-wrong",
  yellow: "bg-amber",
  green: "bg-correct",
  empty: "bg-border",
};

export function TopicHealthGrid({ topics, onTopicClick }: TopicHealthGridProps) {
  if (topics.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        Santé par thème
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {topics.map(({ topic, chapters, overallHealth }) => (
          <button
            key={topic.id}
            onClick={() => onTopicClick(topic.id)}
            className="bg-card border border-border rounded-xl p-4 text-left hover:border-teal/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${HEALTH_COLORS[overallHealth]}`}
              />
              <span className="text-sm font-medium text-foreground flex-1 truncate">
                {topic.name}
              </span>
            </div>

          </button>
        ))}
      </div>
    </div>
  );
}
