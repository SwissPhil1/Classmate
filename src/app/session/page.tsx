"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useSettings } from "@/hooks/use-settings";
import { toast } from "sonner";
import {
  assembleQueue,
  createSession,
  getEntity,
  getChildEntities,
  getEntityImages,
  getSessionState,
  upsertSessionState,
  deleteSessionState,
  updateSession,
  updateEntity,
  createTestResult,
  getBrief,
} from "@/lib/supabase/queries";
import { getImageUrl } from "@/lib/supabase/storage";
import { calculateNextReview } from "@/lib/spaced-repetition";
import type {
  SessionType,
  QueueItem,
  AnswerRecord,
  Entity,
  QAPair,
  QuestionType,
  TestResult,
} from "@/lib/types";
import { SessionQuestion } from "@/components/session/session-question";
import { SessionEnd } from "@/components/session/session-end";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

function SessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: userLoading } = useUser();
  const { settings } = useSettings();
  const supabase = createClient();

  useEffect(() => {
    if (!userLoading && !user) router.push("/login");
  }, [userLoading, user, router]);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionType, setSessionType] = useState<SessionType>("short");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [currentEntity, setCurrentEntity] = useState<Entity | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<{
    type: QuestionType;
    question: string;
    model_answer: string;
    key_points: string[];
    image_urls?: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [direction, setDirection] = useState(1);
  const [questionError, setQuestionError] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [sessionInitialized, setSessionInitialized] = useState(false);

  // Initialize session — guarded to prevent re-init on tab switch
  useEffect(() => {
    if (!user || sessionInitialized) return;

    async function init() {
      try {
        // ALWAYS check for existing session state first — handles tab-switch,
        // full page reload, and browser eviction on mobile
        const existingState = await getSessionState(supabase, user!.id);

        if (existingState) {
          // Resume from saved state
          setSessionId(existingState.session_id);
          setQueue(existingState.queue);
          setCurrentIndex(existingState.current_question_index);
          setAnswers(existingState.answers_so_far as AnswerRecord[]);

          // Fetch session type from the existing session
          const { data: sessionData } = await supabase
            .from("sessions")
            .select("session_type")
            .eq("id", existingState.session_id)
            .single();
          if (sessionData) {
            setSessionType(sessionData.session_type as SessionType);
          }
        } else {
          // No existing state — create new session
          const initSessionType = (searchParams.get("type") || "short") as SessionType;
          const topicFilter = searchParams.get("topic") || undefined;
          setSessionType(initSessionType);

          const session = await createSession(supabase, {
            user_id: user!.id,
            session_type: initSessionType,
            topic_filter: topicFilter,
          });

          const q = await assembleQueue(
            supabase,
            user!.id,
            initSessionType,
            topicFilter,
            settings?.interleaving_enabled ?? false
          );

          setSessionId(session.id);
          setQueue(q);
          setCurrentIndex(0);
          setAnswers([]);

          // Save initial state
          await upsertSessionState(supabase, {
            user_id: user!.id,
            session_id: session.id,
            current_question_index: 0,
            queue: q,
            answers_so_far: [],
          });
        }
        setSessionInitialized(true);
      } catch (err) {
        console.error("Session init error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        setInitError(msg);
        toast.error("Erreur d'initialisation de la session");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [user, sessionInitialized]);

  // Track which question index is loaded to prevent duplicate fetches
  const loadedIndexRef = useRef<number>(-1);

  // Load current question
  useEffect(() => {
    if (queue.length === 0 || currentIndex >= queue.length || loading) return;
    // Skip if this index is already loaded (prevents re-fetch on tab switch)
    if (loadedIndexRef.current === currentIndex && currentQuestion) return;

    const item = queue[currentIndex];
    loadedIndexRef.current = currentIndex;
    loadQuestion(item);
  }, [currentIndex, queue, loading]);

  const cacheQuestionInQueue = async (
    index: number,
    q: { type: QuestionType; question: string; model_answer: string; key_points: string[] }
  ) => {
    const updatedQueue = [...queue];
    updatedQueue[index] = {
      ...updatedQueue[index],
      question: q.question,
      model_answer: q.model_answer,
      key_points: q.key_points,
      question_type: q.type,
    };
    setQueue(updatedQueue);

    if (user && sessionId) {
      await upsertSessionState(supabase, {
        user_id: user.id,
        session_id: sessionId,
        current_question_index: index,
        queue: updatedQueue,
        answers_so_far: answers,
      });
    }
  };

  const fetchWithRetry = async (url: string, options: RequestInit, timeoutMs = 30000, maxRetries = 3) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok || res.status < 500) return res; // Don't retry client errors
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000)); // 1s, 2s, 4s
          continue;
        }
        return res;
      } catch (err) {
        clearTimeout(timeout);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Max retries exceeded");
  };

  const loadQuestion = async (item: QueueItem) => {
    setQuestionLoading(true);
    setQuestionError(false);
    try {
      const entity = await getEntity(supabase, item.entity_id);
      setCurrentEntity(entity);

      // Fetch images for this entity
      let imageUrls: string[] = item.image_urls || [];
      if (imageUrls.length === 0) {
        try {
          const imgs = await getEntityImages(supabase, item.entity_id);
          imageUrls = await Promise.all(imgs.map((img) => getImageUrl(supabase, img.storage_path)));
        } catch {
          // Images optional — don't block the session
        }
      }

      // If question was already generated and cached, reuse it
      if (item.question && item.model_answer) {
        setCurrentQuestion({
          type: item.question_type || "B_open",
          question: item.question,
          model_answer: item.model_answer,
          key_points: item.key_points || [],
          image_urls: imageUrls.length > 0 ? imageUrls : undefined,
        });
        setQuestionLoading(false);
        return;
      }

      let generated: {
        type: QuestionType;
        question: string;
        model_answer: string;
        key_points: string[];
        image_urls?: string[];
      } | null = null;
      const hasImages = imageUrls.length > 0;

      // Fetch children for synthesis questions
      let childrenNames: string[] = [];
      let childrenRefs: string[] = [];
      if (item.is_synthesis) {
        const children = await getChildEntities(supabase, entity.id);
        childrenNames = children.map((c) => c.name);
        childrenRefs = children.map((c) => c.reference_text || "");
      }

      if (item.is_pretest) {
        // Check if pretest was already generated and stored on entity
        if (entity.pretest_question) {
          const pt = entity.pretest_question;
          generated = {
            type: (pt.type === "A" ? "A_typed" : "B_open") as QuestionType,
            question: pt.question,
            model_answer: pt.model_answer,
            key_points: pt.key_points,
          };
        } else {
          // Generate pretest question
          const res = await fetchWithRetry("/api/claude/pretest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entity_name: entity.name,
              entity_type: entity.entity_type,
              chapter: entity.chapter?.name,
              topic: entity.chapter?.topic?.name,
              reference_text: entity.reference_text,
              notes: entity.notes,
              has_images: hasImages,
              image_urls: hasImages ? imageUrls : undefined,
              ...(item.is_synthesis && { is_synthesis: true, children_names: childrenNames, children_references: childrenRefs }),
            }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);

          generated = {
            type: data.type === "A" ? "A_typed" : "B_open",
            question: data.question,
            model_answer: data.model_answer,
            key_points: data.key_points,
          };

          // Store on entity permanently so it never regenerates
          await updateEntity(supabase, entity.id, {
            pretest_question: {
              type: data.type,
              question: data.question,
              model_answer: data.model_answer,
              key_points: data.key_points,
            },
          } as Partial<Entity>);
        }
      } else if (entity.cycle_count < 3 && entity.brief?.qa_pairs) {
        // Cycle 1: use brief's Q&A pairs
        const qaPairs = entity.brief.qa_pairs as QAPair[];
        const pairIndex = entity.cycle_count % qaPairs.length;
        const pair = qaPairs[pairIndex];

        if (pair) {
          const type: QuestionType =
            entity.entity_type === "ddx_pair" ? "B_open" : "A_typed";
          generated = {
            type,
            question: pair.question,
            model_answer: pair.model_answer,
            key_points: pair.key_points,
          };
        }
      } else {
        // Cycle 2+ or brief not ready yet: generate fresh question
        const res = await fetchWithRetry("/api/claude/question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_name: entity.name,
            entity_type: entity.entity_type,
            cycle_count: entity.cycle_count,
            difficulty_level: entity.difficulty_level,
            chapter: entity.chapter?.name,
            topic: entity.chapter?.topic?.name,
            exam_component: entity.chapter?.topic?.exam_component,
            notes: entity.notes,
            reference_text: entity.reference_text,
            has_images: hasImages,
            image_urls: hasImages ? imageUrls : undefined,
            ...(item.is_synthesis && { is_synthesis: true, children_names: childrenNames, children_references: childrenRefs }),
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const typeMap: Record<string, QuestionType> = {
          A: "A_typed",
          B: "B_open",
          C: "C_freeresponse",
        };
        generated = {
          type: typeMap[data.type] || "A_typed",
          question: data.question,
          model_answer: data.model_answer,
          key_points: data.key_points,
        };
      }

      if (generated) {
        if (hasImages) generated.image_urls = imageUrls;
        setCurrentQuestion(generated);
        // Cache in queue so reloads don't regenerate
        await cacheQuestionInQueue(currentIndex, generated);
      }
    } catch (err) {
      console.error("Load question error:", err);
      setCurrentQuestion(null);
      setQuestionError(true);
    } finally {
      setQuestionLoading(false);
    }
  };

  const handleAnswer = useCallback(
    async (result: TestResult, userAnswer: string | null, feedback?: string, confidence?: number) => {
      if (!currentEntity || !currentQuestion || !sessionId || !user) return;

      try {
        const item = queue[currentIndex];

        // Save test result
        await createTestResult(supabase, {
          entity_id: currentEntity.id,
          session_id: sessionId,
          question_text: currentQuestion.question,
          question_type: currentQuestion.type,
          user_answer: userAnswer,
          result,
          auto_evaluated: currentQuestion.type === "A_typed" || currentQuestion.type === "C_freeresponse",
          feedback: feedback || null,
          is_pretest: item.is_pretest,
          interleaved_session: settings?.interleaving_enabled ?? false,
          confidence: confidence ?? null,
        });

        // Update entity with spaced repetition
        const update = calculateNextReview(
          {
            correct_streak: currentEntity.correct_streak,
            difficulty_level: currentEntity.difficulty_level,
            status: currentEntity.status,
            cycle_count: currentEntity.cycle_count,
            last_tested: currentEntity.last_tested,
          },
          result
        );

        const entityUpdate: Record<string, unknown> = { ...update };

        if (item.is_pretest) {
          entityUpdate.pre_test_done = true;
          entityUpdate.pre_test_queued = false;
          entityUpdate.status = "active";
          entityUpdate.next_test_date = update.next_test_date;

          // Fetch children if synthesis for brief generation
          const briefSynthData = item.is_synthesis
            ? await (async () => {
                const ch = await getChildEntities(supabase, currentEntity.id);
                return { is_synthesis: true, children_names: ch.map(c => c.name), children_references: ch.map(c => c.reference_text || "") };
              })()
            : {};

          // Queue brief generation after pretest
          fetch("/api/claude/brief", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entity_name: currentEntity.name,
              entity_type: currentEntity.entity_type,
              chapter: currentEntity.chapter?.name,
              topic: currentEntity.chapter?.topic?.name,
              reference_text: currentEntity.reference_text,
              notes: currentEntity.notes,
              ...briefSynthData,
            }),
          })
            .then((res) => res.json())
            .then(async (briefData) => {
              if (!briefData.error) {
                const { upsertBrief } = await import("@/lib/supabase/queries");
                await upsertBrief(supabase, {
                  entity_id: currentEntity.id,
                  content: briefData.content,
                  qa_pairs: briefData.qa_pairs,
                  difficulty_level: currentEntity.difficulty_level,
                });
                toast.success("Brief généré");
              }
            })
            .catch(() => {
              toast.error("Erreur: brief non généré. Réessayez depuis la fiche.");
            });
        }

        await updateEntity(supabase, currentEntity.id, entityUpdate as Partial<Entity>);

        // Record answer
        const answer: AnswerRecord = {
          entity_id: currentEntity.id,
          entity_name: currentEntity.name,
          topic_name: currentEntity.chapter?.topic?.name,
          question_text: currentQuestion.question,
          question_type: currentQuestion.type,
          user_answer: userAnswer,
          result,
          feedback: feedback || null,
          is_pretest: item.is_pretest,
          confidence,
        };

        const newAnswers = [...answers, answer];
        setAnswers(newAnswers);

        // Check if session is complete
        if (currentIndex + 1 >= queue.length) {
          // Complete session
          const summary = {
            correct: newAnswers.filter((a) => a.result === "correct").length,
            partial: newAnswers.filter((a) => a.result === "partial").length,
            wrong: newAnswers.filter((a) => a.result === "wrong").length,
          };

          await updateSession(supabase, sessionId, {
            completed: true,
            entities_tested: newAnswers.length,
            results_summary: summary,
          });

          await deleteSessionState(supabase, user.id);
          setCompleted(true);
        } else {
          // Move to next question
          const nextIndex = currentIndex + 1;
          setDirection(1);
          setCurrentIndex(nextIndex);

          // Save state
          await upsertSessionState(supabase, {
            user_id: user.id,
            session_id: sessionId,
            current_question_index: nextIndex,
            queue,
            answers_so_far: newAnswers,
          });
        }
      } catch (err) {
        console.error("Session answer error:", err);
        toast.error("Erreur de sauvegarde — votre réponse n'a peut-être pas été enregistrée.");
      }
    },
    [currentEntity, currentQuestion, sessionId, user, queue, currentIndex, answers, settings]
  );

  const handleSaveNote = async (entityId: string, note: string) => {
    try {
      await updateEntity(supabase, entityId, { notes: note } as Partial<Entity>);
    } catch (err) {
      console.error("Save note error:", err);
    }
  };

  const handleReportError = async (entityId: string) => {
    try {
      await updateEntity(supabase, entityId, { pretest_question: null } as Partial<Entity>);
      toast.success("Question signalée — elle sera régénérée à la prochaine session");
    } catch (err) {
      console.error("Report error:", err);
      toast.error("Erreur lors du signalement");
    }
  };

  const handleSaveImage = async (entityId: string, file: File) => {
    if (!user) return;
    try {
      const { uploadEntityImage } = await import("@/lib/supabase/storage");
      const { createEntityImage } = await import("@/lib/supabase/queries");
      const storagePath = await uploadEntityImage(supabase, user.id, entityId, file);
      await createEntityImage(supabase, {
        entity_id: entityId,
        user_id: user.id,
        storage_path: storagePath,
      });
      toast.success("Image ajoutée au brief");
    } catch (err) {
      console.error("Save image error:", err);
      toast.error("Erreur lors de l'upload de l'image");
      throw err;
    }
  };

  const handleAbandon = async () => {
    if (user && sessionId) {
      await deleteSessionState(supabase, user.id);
      await updateSession(supabase, sessionId, { completed: false });
    }
    router.push("/dashboard");
  };

  if (loading || userLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">
            Préparation de la session...
          </p>
        </div>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-lg text-foreground font-medium">
            Aucune carte à tester
          </p>
          <p className="text-sm text-muted-foreground">
            Ajoutez des entités ou attendez les prochaines dates de révision.
          </p>
          {initError && (
            <p className="text-xs text-wrong bg-wrong/10 border border-wrong/20 rounded-lg px-3 py-2">
              Erreur : {initError}
            </p>
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="text-teal hover:underline text-sm"
          >
            Retour au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <SessionEnd
        answers={answers}
        sessionType={sessionType}
        sessionId={sessionId || undefined}
        onReturn={() => router.push("/dashboard")}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-background flex flex-col"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">
            {currentIndex + 1} / {queue.length}
          </span>
          {currentEntity?.chapter?.topic && (
            <span className="text-xs bg-teal/10 text-teal px-2 py-1 rounded-full">
              {currentEntity.chapter.topic.name}
            </span>
          )}
        </div>
        <button
          onClick={handleAbandon}
          aria-label="Abandonner la session"
          className="p-2 rounded-lg hover:bg-card transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-border" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={queue.length} aria-label={`Question ${currentIndex + 1} sur ${queue.length}`}>
        <div
          className="h-full bg-teal transition-all duration-300"
          style={{
            width: `${((currentIndex + 1) / queue.length) * 100}%`,
          }}
        />
      </div>

      {/* Question area */}
      <div className="flex-1 flex flex-col">
        <AnimatePresence mode="wait" custom={direction}>
          {questionLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center"
            >
              <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
            </motion.div>
          ) : questionError ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-4 px-4"
            >
              <p className="text-muted-foreground text-center">Erreur de génération. Vérifiez votre connexion.</p>
              <button
                onClick={() => { setQuestionError(false); loadQuestion(queue[currentIndex]); }}
                className="px-6 py-3 bg-teal text-white rounded-lg font-medium"
              >
                Réessayer
              </button>
            </motion.div>
          ) : currentQuestion && currentEntity ? (
            <motion.div
              key={currentIndex}
              custom={direction}
              initial={{ x: direction * 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction * -300, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex-1 flex flex-col"
            >
              <SessionQuestion
                entity={currentEntity}
                question={currentQuestion}
                isPretest={queue[currentIndex]?.is_pretest ?? false}
                onAnswer={handleAnswer}
                onSaveNote={handleSaveNote}
                onSaveImage={handleSaveImage}
                onReportError={handleReportError}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function SessionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SessionContent />
    </Suspense>
  );
}
