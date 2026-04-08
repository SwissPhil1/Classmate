"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useSettings } from "@/hooks/use-settings";
import { getTestResults } from "@/lib/supabase/queries";
import { weekNumber } from "@/lib/spaced-repetition";
import type { TestResultRecord } from "@/lib/types";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WeeklyPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const { settings } = useSettings();
  const supabase = createClient();

  const [results, setResults] = useState<TestResultRecord[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const week = settings?.week_start_date
    ? weekNumber(settings.week_start_date)
    : 1;

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    // Get results from the last 7 days
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateFrom = weekAgo.toISOString().split("T")[0];
    const dateTo = now.toISOString().split("T")[0];

    getTestResults(supabase, { dateFrom, dateTo })
      .then(setResults)
      .finally(() => setLoading(false));
  }, [user]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/claude/weekly-pattern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: results.map((r) => ({
            entity_name: (r.entity as { name: string } | undefined)?.name || "unknown",
            question_type: r.question_type,
            result: r.result,
            date: r.date,
          })),
          week_number: week,
          total_weeks: 16,
        }),
      });
      const data = await res.json();
      setAnalysis(data.analysis || data.error);
    } catch {
      setAnalysis("Analyse indisponible temporairement");
    } finally {
      setAnalyzing(false);
    }
  };

  const correct = results.filter((r) => r.result === "correct").length;
  const partial = results.filter((r) => r.result === "partial").length;
  const wrong = results.filter((r) => r.result === "wrong").length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-2 rounded-lg hover:bg-card transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-lg font-bold text-foreground">
            Révision semaine {week}
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {loading || userLoading || !user ? (
          <div className="animate-pulse text-muted-foreground text-center py-12">
            Chargement...
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Résumé de la semaine
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-2xl font-bold text-correct">{correct}</p>
                  <p className="text-xs text-muted-foreground">Correct</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-partial">{partial}</p>
                  <p className="text-xs text-muted-foreground">Partiel</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-wrong">{wrong}</p>
                  <p className="text-xs text-muted-foreground">Incorrect</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {results.length} question{results.length !== 1 ? "s" : ""}{" "}
                testée{results.length !== 1 ? "s" : ""} cette semaine
              </p>
            </div>

            {/* Start weekly review test */}
            <Button
              onClick={() => router.push("/session?type=weekly_review")}
              className="w-full h-14 bg-teal hover:bg-teal-light text-white font-semibold"
            >
              Lancer le test de révision
            </Button>

            {/* Claude Analysis */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Analyse de la semaine
              </h2>
              {analysis ? (
                <div
                  className="text-sm text-foreground leading-relaxed prose prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: analysis.replace(/\n/g, "<br>") }}
                />
              ) : (
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzing || results.length === 0}
                  variant="outline"
                  className="w-full border-border"
                >
                  {analyzing
                    ? "Analyse en cours..."
                    : results.length === 0
                      ? "Pas assez de données"
                      : "Générer l'analyse"}
                </Button>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
