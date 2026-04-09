"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useSettings } from "@/hooks/use-settings";
import {
  getDueCount,
  getPretestCount,
  getTopicHealthGrid,
  getSessionState,
} from "@/lib/supabase/queries";
import { daysUntil, weekNumber } from "@/lib/spaced-repetition";
import type { TopicHealth, SessionType } from "@/lib/types";
import { ExamCountdown } from "@/components/dashboard/exam-countdown";
import { TodayQueue } from "@/components/dashboard/today-queue";
import { TopicHealthGrid } from "@/components/dashboard/topic-health-grid";
import { QuickAddButton } from "@/components/dashboard/quick-add-button";
import { QuickAddSheet } from "@/components/dashboard/quick-add-sheet";
import { ResumeSessionModal } from "@/components/dashboard/resume-session-modal";
import { InterleavingNudge } from "@/components/dashboard/interleaving-nudge";
import { Settings, BookOpen } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const { settings } = useSettings();
  const supabase = createClient();

  const [dueCount, setDueCount] = useState(0);
  const [pretestCount, setPretestCount] = useState(0);
  const [topicHealth, setTopicHealth] = useState<TopicHealth[]>([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [resumeSession, setResumeSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!userLoading && !user) {
      router.push("/login");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    async function loadDashboard() {
      try {
        const [due, pretest, health, existingState] = await Promise.all([
          getDueCount(supabase, user!.id),
          getPretestCount(supabase, user!.id),
          getTopicHealthGrid(supabase, user!.id),
          getSessionState(supabase, user!.id),
        ]);
        setDueCount(due);
        setPretestCount(pretest);
        setTopicHealth(health);
        if (existingState) {
          setResumeSession(existingState.session_id);
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [user]);

  const handleStartSession = (sessionType: SessionType, topicId?: string) => {
    const params = new URLSearchParams({ type: sessionType });
    if (topicId) params.set("topic", topicId);
    router.push(`/session?${params.toString()}`);
  };

  if (userLoading || !user || loading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        {/* Header skeleton */}
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <h1 className="text-lg font-bold text-foreground">RadLoop</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Exam countdown skeleton */}
          <div className="animate-pulse bg-card rounded-xl h-[100px]" />
          {/* Today queue skeleton */}
          <div className="animate-pulse bg-card rounded-xl h-[140px]" />
          {/* Topic health grid skeleton */}
          <div className="animate-pulse bg-card rounded-xl h-[320px]" />
        </main>
      </div>
    );
  }

  const writtenDays = settings
    ? daysUntil(settings.exam_date_written)
    : daysUntil("2026-08-26");
  const oralDays = settings
    ? daysUntil(settings.exam_date_oral_start)
    : daysUntil("2026-08-27");
  const week = settings?.week_start_date
    ? weekNumber(settings.week_start_date)
    : 1;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">RadLoop</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/topics"
              className="p-2 rounded-lg hover:bg-card transition-colors"
            >
              <BookOpen className="w-5 h-5 text-muted-foreground" />
            </Link>
            <Link
              href="/settings"
              className="p-2 rounded-lg hover:bg-card transition-colors"
            >
              <Settings className="w-5 h-5 text-muted-foreground" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Exam Countdown */}
        <ExamCountdown
          writtenDays={writtenDays}
          oralDays={oralDays}
          week={week}
        />

        {/* Today's Queue */}
        <TodayQueue
          dueCount={dueCount}
          pretestCount={pretestCount}
          onStartSession={handleStartSession}
        />

        {/* Interleaving Nudge */}
        <InterleavingNudge />

        {/* Topic Health Grid */}
        <TopicHealthGrid
          topics={topicHealth}
          onTopicClick={(id) => router.push(`/topics/${id}`)}
        />
      </main>

      {/* Quick Add FAB */}
      <QuickAddButton onClick={() => setQuickAddOpen(true)} />

      {/* Quick Add Sheet */}
      <QuickAddSheet
        open={quickAddOpen}
        onClose={() => {
          setQuickAddOpen(false);
          // Refresh counts
          if (user) {
            getPretestCount(supabase, user.id).then(setPretestCount);
          }
        }}
      />

      {/* Resume Session Modal */}
      {resumeSession && (
        <ResumeSessionModal
          sessionId={resumeSession}
          onResume={() => router.push(`/session?resume=${resumeSession}`)}
          onAbandon={async () => {
            if (user) {
              const { deleteSessionState } = await import(
                "@/lib/supabase/queries"
              );
              await deleteSessionState(supabase, user.id);
            }
            setResumeSession(null);
          }}
        />
      )}

      {/* Empty state */}
      {topicHealth.every((t) =>
        t.chapters.every((c) => c.health === "empty")
      ) &&
        dueCount === 0 &&
        pretestCount === 0 && (
          <div className="max-w-2xl mx-auto px-4">
            <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
              <div className="w-16 h-16 bg-border/30 rounded-xl mx-auto mb-4 animate-pulse" />
              <p className="text-muted-foreground">
                Ajoutez votre première entité pour commencer
              </p>
            </div>
          </div>
        )}
    </div>
  );
}
