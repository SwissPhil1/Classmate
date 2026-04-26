"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useSettings } from "@/hooks/use-settings";
import { useTheme } from "@/components/providers/theme-provider";
import { daysUntil, weekNumber } from "@/lib/spaced-repetition";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Sun, Moon, LogOut, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const { settings, updateSettings } = useSettings();
  const { theme, setTheme } = useTheme();
  const supabase = createClient();
  const [exporting, setExporting] = useState(false);
  const [seedingMmt, setSeedingMmt] = useState(false);
  const [seedProgress, setSeedProgress] = useState<string | null>(null);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  const handleInitMnemonics = async () => {
    if (seedingMmt) return;
    setSeedingMmt(true);
    setSeedProgress("Initialisation du catalogue…");
    try {
      const seedRes = await fetch("/api/admin/seed-mnemonics", { method: "POST" });
      const seedData = await seedRes.json();
      if (!seedRes.ok) {
        toast.error(seedData.error || "Seed impossible");
        return;
      }
      toast.success(`Catalogue : ${seedData.affected}/${seedData.total} mnémoniques`);

      // Now generate content in batches until none remain pending.
      let totalGenerated = 0;
      let safety = 12; // max 12 batches → 240 max, well above 89
      while (safety-- > 0) {
        setSeedProgress(`Génération du contenu (${totalGenerated} faits)…`);
        const genRes = await fetch("/api/claude/generate-mnemonic-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch_size: 10 }),
        });
        const genData = await genRes.json();
        if (!genRes.ok) {
          toast.error(genData.error || "Génération interrompue");
          break;
        }
        totalGenerated += genData.generated || 0;
        if (genData.done) break;
      }
      toast.success(`${totalGenerated} mémos générés. Module prêt.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSeedingMmt(false);
      setSeedProgress(null);
    }
  };

  const writtenDays = settings
    ? daysUntil(settings.exam_date_written)
    : 0;
  const oralDays = settings
    ? daysUntil(settings.exam_date_oral_start)
    : 0;
  const week = settings?.week_start_date
    ? weekNumber(settings.week_start_date)
    : 1;

  const handleExportEntities = async () => {
    setExporting(true);
    try {
      const { data } = await supabase
        .from("entities")
        .select("*, chapter:chapters(name, topic:topics(name)), source:sources(name)")
        .eq("user_id", user!.id);

      if (!data) return;

      const headers = [
        "name",
        "entity_type",
        "status",
        "topic",
        "chapter",
        "source",
        "correct_streak",
        "cycle_count",
        "difficulty_level",
        "date_flagged",
        "last_tested",
        "next_test_date",
      ];

      const rows = data.map((e: Record<string, unknown>) => {
        const chapter = e.chapter as { name: string; topic: { name: string } } | null;
        const source = e.source as { name: string } | null;
        return [
          e.name,
          e.entity_type,
          e.status,
          chapter?.topic?.name || "",
          chapter?.name || "",
          source?.name || "",
          e.correct_streak,
          e.cycle_count,
          e.difficulty_level,
          e.date_flagged,
          e.last_tested || "",
          e.next_test_date || "",
        ].join(",");
      });

      const csv = [headers.join(","), ...rows].join("\n");
      downloadCSV(csv, "radloop_entities.csv");
    } finally {
      setExporting(false);
    }
  };

  const handleExportResults = async () => {
    setExporting(true);
    try {
      const { data } = await supabase
        .from("test_results")
        .select("*, entity:entities(name)")
        .eq("user_id", user!.id)
        .order("date", { ascending: false });

      if (!data) return;

      const headers = [
        "date",
        "entity_name",
        "question_type",
        "question_text",
        "result",
        "feedback",
        "is_pretest",
      ];

      const rows = data.map((r: Record<string, unknown>) => {
        const entity = r.entity as { name: string } | null;
        return [
          r.date,
          `"${entity?.name || ""}"`,
          r.question_type,
          `"${String(r.question_text || "").replace(/"/g, '""')}"`,
          r.result,
          `"${String(r.feedback || "").replace(/"/g, '""')}"`,
          r.is_pretest,
        ].join(",");
      });

      const csv = [headers.join(","), ...rows].join("\n");
      downloadCSV(csv, "radloop_test_results.csv");
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (userLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

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
          <h1 className="text-lg font-bold text-foreground">Paramètres</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Exam Info */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Examen FMH2
          </h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-foreground">Écrit</span>
              <span className="text-sm text-muted-foreground">
                26.08.2026 (J-{writtenDays})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-foreground">Oral</span>
              <span className="text-sm text-muted-foreground">
                27-28.08.2026 (J-{oralDays})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-foreground">Semaine</span>
              <span className="text-sm text-muted-foreground">
                {week} sur 16
              </span>
            </div>
          </div>
        </div>

        {/* Theme */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Apparence
          </h2>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setTheme("dark");
                updateSettings({ theme: "dark" });
              }}
              className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-lg border transition-colors ${
                theme === "dark"
                  ? "border-teal bg-teal/10 text-teal"
                  : "border-border text-muted-foreground"
              }`}
            >
              <Moon className="w-4 h-4" />
              Sombre
            </button>
            <button
              onClick={() => {
                setTheme("light");
                updateSettings({ theme: "light" });
              }}
              className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-lg border transition-colors ${
                theme === "light"
                  ? "border-teal bg-teal/10 text-teal"
                  : "border-border text-muted-foreground"
              }`}
            >
              <Sun className="w-4 h-4" />
              Clair
            </button>
          </div>
        </div>

        {/* Interleaving */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Interleaving
          </h2>
          <p className="text-xs text-muted-foreground">
            Mélange les thèmes pendant les sessions pour améliorer la rétention
            à long terme.
          </p>
          <button
            onClick={() =>
              updateSettings({
                interleaving_enabled: !settings?.interleaving_enabled,
              })
            }
            className={`w-full h-12 rounded-lg border font-medium text-sm transition-colors ${
              settings?.interleaving_enabled
                ? "border-teal bg-teal/10 text-teal"
                : "border-border text-muted-foreground"
            }`}
          >
            {settings?.interleaving_enabled ? "Activé" : "Désactivé"}
          </button>
        </div>

        {/* Mnemonic module init */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Module mnémoniques
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Initialise le catalogue des 89 mnémoniques validées et génère le
            contenu pédagogique via Claude (~$0.50, 90 secondes). Idempotent —
            re-runner ne re-paie que les mnémos manquantes.
          </p>
          <Button
            onClick={handleInitMnemonics}
            disabled={seedingMmt}
            variant="outline"
            className="w-full h-12 border-amber/40 text-amber hover:bg-amber/10"
          >
            {seedingMmt ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {seedProgress || "Initialiser le module mnémoniques"}
          </Button>
        </div>

        {/* Export */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Exporter les données
          </h2>
          <div className="space-y-2">
            <Button
              onClick={handleExportEntities}
              disabled={exporting}
              variant="outline"
              className="w-full h-12 border-border"
            >
              <Download className="w-4 h-4 mr-2" />
              Exporter les entités (CSV)
            </Button>
            <Button
              onClick={handleExportResults}
              disabled={exporting}
              variant="outline"
              className="w-full h-12 border-border"
            >
              <Download className="w-4 h-4 mr-2" />
              Exporter les résultats (CSV)
            </Button>
          </div>
        </div>

        {/* Logout */}
        <Button
          onClick={handleLogout}
          variant="outline"
          className="w-full h-12 border-wrong/30 text-wrong hover:bg-wrong/10"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Se déconnecter
        </Button>
      </main>
    </div>
  );
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
