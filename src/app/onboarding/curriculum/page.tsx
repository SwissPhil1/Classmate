"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getCurricula } from "@/lib/supabase/queries";
import type { Curriculum } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function OnboardingCurriculumPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, loading: userLoading } = useUser();

  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  useEffect(() => {
    getCurricula(supabase)
      .then((c) => {
        setCurricula(c);
        if (c.length > 0) setSelected(c[0].id);
      })
      .finally(() => setLoading(false));
  }, [supabase]);

  const handleConfirm = async () => {
    if (!user || !selected) return;
    const curriculum = curricula.find((c) => c.id === selected);
    if (!curriculum) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from("user_settings").insert({
        user_id: user.id,
        curriculum_id: curriculum.id,
        exam_date_written: curriculum.exam_date_written,
        exam_date_oral_start: curriculum.exam_date_oral_start,
        exam_date_oral_end: curriculum.exam_date_oral_end,
        week_start_date: new Date().toISOString().split("T")[0],
      });
      if (error) throw error;
      router.push("/dashboard");
    } catch (err) {
      console.error("Onboarding error:", err);
      toast.error("Impossible d'enregistrer le cursus, réessaie.");
      setSubmitting(false);
    }
  };

  if (userLoading || !user || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Chargement…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Bienvenue sur RadLoop</h1>
          <p className="text-muted-foreground text-sm">
            Choisis le cursus que tu prépares. Tu peux le changer plus tard
            dans les paramètres.
          </p>
        </div>

        <div className="space-y-3">
          {curricula.map((c) => {
            const isActive = selected === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`w-full text-left bg-card border rounded-xl p-4 transition-colors ${
                  isActive
                    ? "border-teal bg-teal/10"
                    : "border-border hover:border-teal/50"
                }`}
              >
                <p className="font-medium text-foreground">{c.display_name}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.exam_name}</p>
              </button>
            );
          })}
        </div>

        <Button
          onClick={handleConfirm}
          disabled={!selected || submitting}
          className="w-full h-12 bg-teal hover:bg-teal-light text-white font-medium"
        >
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Continuer
        </Button>
      </div>
    </div>
  );
}
