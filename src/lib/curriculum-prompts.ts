import type { SupabaseClient } from '@supabase/supabase-js'
import { getCurriculum, getUserSettings } from '@/lib/supabase/queries'
import type { Curriculum } from '@/lib/types'

/**
 * Resolve the active user's curriculum from `user_settings.curriculum_id`.
 * Returns null when there's no auth'd user or no settings row yet — callers
 * should fall back to a curriculum-agnostic prelude in that case.
 */
export async function getCurrentUserCurriculum(
  supabase: SupabaseClient
): Promise<Curriculum | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const settings = await getUserSettings(supabase, user.id)
  if (!settings?.curriculum_id) return null
  return getCurriculum(supabase, settings.curriculum_id)
}

/**
 * One-line persona/exam framing prepended to Claude system prompts so the
 * tutor adapts to the user's specialty (radiology FMH2 vs nuclear medicine
 * FMH). Keep the exam_name ready to be inserted after `l'` so it works for
 * both "l'FMH2 de radiologie suisse" and "l'FMH de médecine nucléaire suisse".
 */
export function buildCoachPrelude(c: Curriculum): string {
  return `Tu es un ${c.expert_role} et coach pour l'${c.exam_name}. Tu t'adresses à un ${c.student_level} en formation dernière année.`
}

/**
 * Fallback used when curriculum can't be resolved (unauthenticated request,
 * settings row missing). Mirrors the legacy hardcoded radiology framing so
 * existing flows don't suddenly degrade.
 */
export const DEFAULT_COACH_PRELUDE =
  "Tu es un radiologue expert et coach pour l'FMH2 de radiologie suisse. Tu t'adresses à un résident en radiologie en formation dernière année."

export async function resolveCoachPrelude(supabase: SupabaseClient): Promise<string> {
  const c = await getCurrentUserCurriculum(supabase)
  return c ? buildCoachPrelude(c) : DEFAULT_COACH_PRELUDE
}
