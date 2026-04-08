"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getTestResults, getEntities } from "@/lib/supabase/queries";
import type { TestResultRecord } from "@/lib/types";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MonthlyPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const supabase = createClient();

  const [results, setResults] = useState<TestResultRecord[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateFrom = monthAgo.toISOString().split("T")[0];
    const dateTo = now.toISOString().split("T")[0];

    getTestResults(supabase, { dateFrom, dateTo })
      .then(setResults)
      .finally(() => setLoading(false));
  }, [user]);

  const handleAnalyze = async () => {
    if (!user) return;
    setAnalyzing(true);
    try {
      const entities = await getEntities(supabase, user.id);
      const res = await fetch("/api/claude/monthly-pattern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: results.map((r) => ({
            entity_name: (r.entity as { name: string } | undefined)?.name || "unknown",
            question_type: r.question_type,
            result: r.result,
            date: r.date,
          })),
          entities: entities.map((e) => ({
            name: e.name,
            status: e.status,
            chapter: e.chapter?.name,
            topic: e.chapter?.topic?.name,
            correct_streak: e.correct_streak,
            cycle_count: e.cycle_count,
          })),
          month_number: 1,
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
            Révision mensuelle
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
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Résumé du mois
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
            </div>

            <Button
              onClick={() => router.push("/session?type=monthly_review")}
              className="w-full h-14 bg-teal hover:bg-teal-light text-white font-semibold"
            >
              Lancer le test mensuel
            </Button>

            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Analyse mensuelle
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
