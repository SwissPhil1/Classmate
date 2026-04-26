"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Zap, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { getTopics, getChapters } from "@/lib/supabase/queries";
import { BulkAnalyzeImagesButton } from "@/components/quiz/bulk-analyze-images-button";
import type { Topic, Chapter, ImageModality } from "@/lib/types";

type SrsMode = "due" | "new" | "all";
type RunMode = "standard" | "blitz";

const MODALITIES: { value: "" | ImageModality; label: string }[] = [
  { value: "", label: "Toutes" },
  { value: "CT", label: "CT" },
  { value: "IRM", label: "IRM" },
  { value: "RX", label: "RX" },
  { value: "US", label: "US" },
  { value: "UIV", label: "UIV" },
  { value: "angio", label: "Angio" },
];

const COUNTS = [10, 25, 50, 100];

export default function QuizImagesConfigPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, loading: userLoading } = useUser();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topicId, setTopicId] = useState<string>("");
  const [chapterId, setChapterId] = useState<string>("");
  const [modality, setModality] = useState<"" | ImageModality>("");
  const [srsMode, setSrsMode] = useState<SrsMode>("due");
  const [runMode, setRunMode] = useState<RunMode>("standard");
  const [count, setCount] = useState<number>(25);

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  useEffect(() => {
    void getTopics(supabase).then(setTopics);
  }, [supabase]);

  useEffect(() => {
    if (!topicId) {
      setChapters([]);
      setChapterId("");
      return;
    }
    void getChapters(supabase, topicId).then(setChapters);
    setChapterId("");
  }, [supabase, topicId]);

  const launch = () => {
    const params = new URLSearchParams();
    if (topicId) params.set("topic", topicId);
    if (chapterId) params.set("chapter", chapterId);
    if (modality) params.set("modality", modality);
    params.set("mode", srsMode);
    params.set("run", runMode);
    params.set("count", String(count));
    router.push(`/quiz/images/session?${params.toString()}`);
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
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Retour"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Quiz d&apos;images</h1>
        </div>

        <p className="text-sm text-muted-foreground">
          Sélectionne une portée et lance une session. Les images sans brief Claude
          (statut « analyse en cours » ou « erreur ») sont exclues automatiquement.
        </p>

        <BulkAnalyzeImagesButton />

        <div className="space-y-4">
          <Section label="Thème">
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="w-full h-11 bg-card border border-border rounded-lg px-3 text-sm text-foreground"
            >
              <option value="">Tous les thèmes</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Section>

          {topicId && chapters.length > 0 && (
            <Section label="Chapitre">
              <select
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                className="w-full h-11 bg-card border border-border rounded-lg px-3 text-sm text-foreground"
              >
                <option value="">Tous les chapitres</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Section>
          )}

          <Section label="Modalité">
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {MODALITIES.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setModality(opt.value)}
                  className={`h-10 rounded-lg text-xs font-medium transition-colors ${
                    modality === opt.value
                      ? "bg-teal text-white"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Section>

          <Section label="Mode SRS">
            <div className="grid grid-cols-3 gap-1.5">
              <ModeButton active={srsMode === "due"} onClick={() => setSrsMode("due")} label="À réviser" sub="dus + nouveaux" />
              <ModeButton active={srsMode === "new"} onClick={() => setSrsMode("new")} label="Nouveaux" sub="jamais vus" />
              <ModeButton active={srsMode === "all"} onClick={() => setSrsMode("all")} label="Tout" sub="ignorer SRS" />
            </div>
          </Section>

          <Section label="Nombre d'images">
            <div className="grid grid-cols-4 gap-1.5">
              {COUNTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCount(c)}
                  className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                    count === c
                      ? "bg-teal text-white"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Section>

          <Section label="Cadence">
            <div className="grid grid-cols-2 gap-1.5">
              <ModeButton
                active={runMode === "standard"}
                onClick={() => setRunMode("standard")}
                label="Standard"
                sub="reveal manuel"
                icon={<Sparkles className="w-3.5 h-3.5" />}
              />
              <ModeButton
                active={runMode === "blitz"}
                onClick={() => setRunMode("blitz")}
                label="Blitz"
                sub="reveal auto 10s"
                icon={<Zap className="w-3.5 h-3.5" />}
              />
            </div>
          </Section>
        </div>

        <button
          onClick={launch}
          className="w-full h-12 flex items-center justify-center gap-2 bg-teal hover:bg-teal-light text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Play className="w-4 h-4" />
          Lancer la session
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      {children}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  sub,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-14 px-3 rounded-lg flex flex-col items-center justify-center transition-colors ${
        active
          ? "bg-teal text-white"
          : "bg-card border border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className="flex items-center gap-1 text-sm font-medium">
        {icon}
        {label}
      </span>
      <span className={`text-[10px] ${active ? "text-white/80" : "text-muted-foreground"}`}>
        {sub}
      </span>
    </button>
  );
}
