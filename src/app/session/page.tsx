"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useSettings } from "@/hooks/use-settings";
import { toast } from "sonner";
import {
  assembleQueue,
  createSession,
  getEntity,
  getSessionState,
  upsertSessionState,
  deleteSessionState,
  updateSession,
  updateEntity,
  createTestResult,
  getBrief,
} from "@/lib/supabase/queries";
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
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [currentEntity, setCurrentEntity] = useState<Entity | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<{
    type: QuestionType;
    question: string;
    model_answer: string;
    key_points: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [direction, setDirection] = useState(1);
  const [questionError, setQuestionError] = useState(false);

  // Initialize session
  useEffect(() => {
    if (!user) return;

    const resumeId = searchParams.get("resume");
    const sessionType = (searchParams.get("type") || "short") as SessionType;
    const topicFilter = searchParams.get("topic") || undefined;

    async function init() {
      try {
        if (resumeId) {
          // Resume existing session
          const state = await getSessionState(supabase, user!.id);
          if (state) {
            setSessionId(state.session_id);
            setQueue(state.queue);
            setCurrentIndex(state.current_question_index);
            setAnswers(state.answers_so_far as AnswerRecord[]);
          }
        } else {
          // Create new session
          const session = await createSession(supabase, {
            user_id: user!.id,
            session_type: sessionType,
            topic_filter: topicFilter,
          });

          const q = await assembleQueue(
            supabase,
            user!.id,
            sessionType,
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
      } catch (err) {
        console.error("Session init error:", err);
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [user]);

  // Load current question
  useEffect(() => {
    if (queue.length === 0 || currentIndex >= queue.length || loading) return;

    const item = queue[currentIndex];
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

  const loadQuestion = async (item: QueueItem) => {
    setQuestionLoading(true);
    try {
      const entity = await getEntity(supabase, item.entity_id);
      setCurrentEntity(entity);

      // If question was already generated and cached, reuse it
      if (item.question && item.model_answer) {
        setCurrentQuestion({
          type: item.question_type || "B_open",
          question: item.question,
          model_answer: item.model_answer,
          key_points: item.key_points || [],
        });
        setQuestionLoading(false);
        return;
      }

      let generated: {
        type: QuestionType;
        question: string;
        model_answer: string;
        key_points: string[];
      } | null = null;

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
          const res = await fetch("/api/claude/pretest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entity_name: entity.name,
              entity_type: entity.entity_type,
              chapter: entity.chapter?.name,
              topic: entity.chapter?.topic?.name,
              reference_text: entity.reference_text,
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
        // Cycle 2+: generate new question
        const res = await fetch("/api/claude/question", {
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
    async (result: TestResult, userAnswer: string | null, feedback?: string) => {
      if (!currentEntity || !currentQuestion || !sessionId || !user) return;

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
      });

      // Update entity with spaced repetition
      const update = calculateNextReview(
        {
          correct_streak: currentEntity.correct_streak,
          difficulty_level: currentEntity.difficulty_level,
          status: currentEntity.status,
          cycle_count: currentEntity.cycle_count,
        },
        result
      );

      const entityUpdate: Record<string, unknown> = { ...update };

      if (item.is_pretest) {
        entityUpdate.pre_test_done = true;
        entityUpdate.pre_test_queued = false;
        entityUpdate.status = "active";
        entityUpdate.next_test_date = update.next_test_date;

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
        question_text: currentQuestion.question,
        question_type: currentQuestion.type,
        user_answer: userAnswer,
        result,
        feedback: feedback || null,
        is_pretest: item.is_pretest,
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
    },
    [currentEntity, currentQuestion, sessionId, user, queue, currentIndex, answers, settings]
  );

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
          className="p-2 rounded-lg hover:bg-card transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-border">
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
