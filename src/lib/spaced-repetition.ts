import type { Entity, TestResult, DifficultyLevel, Priority } from './types'

/** SM-2 adapted intervals for RadLoop */
const STREAK_INTERVALS: Record<number, number> = {
  0: 3,   // first correct: +3 days
  1: 7,   // second correct: +7 days
  2: 16,  // third correct: +16 days
  3: 0,   // fourth correct: archived (no more tests)
}

/** Difficulty shortens intervals — harder items tested sooner */
const DIFFICULTY_MULTIPLIER: Record<DifficultyLevel, number> = {
  1: 1.0,
  2: 0.85,
  3: 0.7,
}

/** Priority compresses intervals — vital items recycle ~2× faster */
const PRIORITY_MULTIPLIER: Record<Priority, number> = {
  normal: 1.0,
  vital: 0.5,
}

/** Vital items never archive — cap their fourth-correct interval instead */
const VITAL_MAX_INTERVAL_DAYS = 30

/** Sprint phase floor — wrong/short intervals cap here so nothing is left behind. */
const SPRINT_INTERVAL_CAP_DAYS = 2

/** Surge resurrection: archived items return spread randomly across this many days
 *  (or `daysUntilExam - 7`, whichever is smaller) so the user doesn't get a flood. */
const SURGE_SPREAD_MAX_DAYS = 21

interface SpacedRepetitionUpdate {
  correct_streak: number
  next_test_date: string | null
  status: Entity['status']
  difficulty_level: DifficultyLevel
  last_tested: string
  cycle_count: number
}

/** Phase of the study cycle relative to the target exam date.
 *  - build  (>30j or no date)  → standard SM-2, archive normally
 *  - surge  (8-30j)            → cap intervals, resurrect archived items, no decay
 *  - sprint (≤7j)              → very tight cap, never archive
 */
export type ExamPhase = 'build' | 'surge' | 'sprint'

export function examPhase(daysUntilExam: number | null): ExamPhase {
  if (daysUntilExam == null || daysUntilExam > 30) return 'build'
  if (daysUntilExam > 7) return 'surge'
  return 'sprint'
}

/** Maximum days an interval can extend during the given phase.
 *  null means "no exam-aware cap" (build phase or no exam date set). */
function examPhaseCap(daysUntilExam: number | null): number | null {
  const phase = examPhase(daysUntilExam)
  if (phase === 'build') return null
  if (phase === 'sprint') return SPRINT_INTERVAL_CAP_DAYS
  // surge: roughly a third of the remaining window, but at least 2 days
  return Math.max(2, Math.floor((daysUntilExam ?? 0) / 3))
}

function applyCap(days: number, cap: number | null): number {
  if (cap == null) return days
  return Math.max(1, Math.min(days, cap))
}

/** Check if entity needs mastery decay (inactivity > 30 days demotes solid → active).
 *  Skipped during surge/sprint phases — exam-phase logic handles freshness instead. */
export function checkMasteryDecay(
  entity: Pick<Entity, 'status' | 'last_tested' | 'correct_streak' | 'cycle_count'>,
  examDate?: string | null,
): { needsDecay: boolean; updates?: Partial<Pick<Entity, 'status' | 'correct_streak' | 'next_test_date' | 'cycle_count'>> } {
  if (entity.status !== 'solid' && entity.status !== 'archived') return { needsDecay: false }
  if (!entity.last_tested) return { needsDecay: false }

  // During surge/sprint the resurrection logic owns archived → active transitions.
  // Decaying on top of that double-fires updates and skews intervals.
  if (examDate) {
    const phase = examPhase(daysUntil(examDate))
    if (phase !== 'build') return { needsDecay: false }
  }

  const daysSinceTest = daysBetween(entity.last_tested.split('T')[0], new Date().toISOString().split('T')[0])

  // Solid items decay after 30 days, archived after 60 days
  const threshold = entity.status === 'archived' ? 60 : 30

  if (daysSinceTest > threshold) {
    const today = new Date().toISOString().split('T')[0]
    return {
      needsDecay: true,
      updates: {
        status: 'active',
        correct_streak: Math.max(0, entity.correct_streak - 1),
        next_test_date: today, // Due immediately
        // Reset cycle if >30 days gap so they get easier questions first
        cycle_count: daysSinceTest > 30 ? Math.max(1, entity.cycle_count) : entity.cycle_count,
      },
    }
  }
  return { needsDecay: false }
}

/** During surge phase, archived items rejoin the active pool with a staggered
 *  next_test_date so the user revisits everything at least once before sprint. */
export function checkExamSurge(
  entity: Pick<Entity, 'status' | 'correct_streak'>,
  examDate: string | null | undefined,
): { needsSurge: boolean; updates?: Partial<Pick<Entity, 'status' | 'correct_streak' | 'next_test_date'>> } {
  if (!examDate) return { needsSurge: false }
  if (entity.status !== 'archived') return { needsSurge: false }
  const days = daysUntil(examDate)
  if (days < 1) return { needsSurge: false }
  const phase = examPhase(days)
  if (phase === 'build') return { needsSurge: false }

  // Spread evenly across [0, min(days - 7, SURGE_SPREAD_MAX_DAYS)] so the
  // resurrected pool doesn't all land on day one.
  const spreadMax = Math.max(0, Math.min(days - 7, SURGE_SPREAD_MAX_DAYS))
  const offset = Math.floor(Math.random() * (spreadMax + 1))
  const today = new Date().toISOString().split('T')[0]
  return {
    needsSurge: true,
    updates: {
      status: 'active',
      // Drop streak from 4 → 2 so calculateNextReview's next correct response
      // promotes back to 'solid' rather than instantly re-archiving.
      correct_streak: 2,
      next_test_date: addDays(today, offset),
    },
  }
}

export function calculateNextReview(
  entity: Pick<Entity, 'correct_streak' | 'difficulty_level' | 'status' | 'cycle_count' | 'last_tested'> & { priority?: Priority },
  result: TestResult,
  examDate?: string | null,
): SpacedRepetitionUpdate {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  let { correct_streak, difficulty_level, cycle_count } = entity
  const priority: Priority = entity.priority ?? 'normal'
  const priorityMult = PRIORITY_MULTIPLIER[priority]
  const daysToExam = examDate ? daysUntil(examDate) : null
  const phase = examPhase(daysToExam)
  const cap = examPhaseCap(daysToExam)

  // If long gap since last test (>30 days), reset cycle for gentler re-entry
  if (entity.last_tested) {
    const daysSince = daysBetween(entity.last_tested.split('T')[0], today)
    if (daysSince > 30) {
      cycle_count = 0 // Reset to cycle 0 so it increments to 1
    }
  }

  // Always increment cycle count
  cycle_count += 1

  if (result === 'correct') {
    correct_streak += 1

    if (correct_streak >= 4) {
      // In surge/sprint nothing archives — keep everything in rotation up to the exam.
      if (phase !== 'build') {
        const days = applyCap(VITAL_MAX_INTERVAL_DAYS, cap)
        return {
          correct_streak: 4,
          next_test_date: addDays(today, days),
          status: 'solid',
          difficulty_level,
          last_tested: now.toISOString(),
          cycle_count,
        }
      }

      // Vital items never fully archive — cap interval and keep them active-ish
      if (priority === 'vital') {
        const nextDate = addDays(today, Math.max(1, Math.round(VITAL_MAX_INTERVAL_DAYS * priorityMult)))
        return {
          correct_streak: 4,
          next_test_date: nextDate,
          status: 'solid',
          difficulty_level,
          last_tested: now.toISOString(),
          cycle_count,
        }
      }
      return {
        correct_streak: 4,
        next_test_date: null,
        status: 'archived',
        difficulty_level,
        last_tested: now.toISOString(),
        cycle_count,
      }
    }

    const baseDays = STREAK_INTERVALS[correct_streak - 1] ?? 16
    const diffMult = DIFFICULTY_MULTIPLIER[difficulty_level] ?? 1
    const daysToAdd = applyCap(Math.max(1, Math.round(baseDays * diffMult * priorityMult)), cap)
    const nextDate = addDays(today, daysToAdd)

    return {
      correct_streak,
      next_test_date: nextDate,
      status: correct_streak >= 3 ? 'solid' : 'active',
      difficulty_level,
      last_tested: now.toISOString(),
      cycle_count,
    }
  }

  if (result === 'partial') {
    // Streak unchanged, +2 days (difficulty-adjusted)
    const baseDays = 2
    const diffMult = DIFFICULTY_MULTIPLIER[difficulty_level] ?? 1
    const daysToAdd = applyCap(Math.max(1, Math.round(baseDays * diffMult * priorityMult)), cap)
    const nextDate = addDays(today, daysToAdd)
    return {
      correct_streak,
      next_test_date: nextDate,
      status: 'active',
      difficulty_level,
      last_tested: now.toISOString(),
      cycle_count,
    }
  }

  // Wrong: streak resets to 0 (not just -1), next = tomorrow, difficulty +1
  // This is a stricter penalty — consistent with SM-2 lapse handling
  correct_streak = 0
  difficulty_level = Math.min(3, difficulty_level + 1) as DifficultyLevel
  const nextDate = addDays(today, 1)

  return {
    correct_streak: 0,
    next_test_date: nextDate,
    status: 'active',
    difficulty_level,
    last_tested: now.toISOString(),
    cycle_count,
  }
}

function daysBetween(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(dateStr1 + 'T00:00:00Z')
  const d2 = new Date(dateStr2 + 'T00:00:00Z')
  return Math.abs(Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)))
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/** Calculate days until a target date from today */
export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00Z')
  const now = new Date()
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return Math.ceil((target.getTime() - todayUTC.getTime()) / (1000 * 60 * 60 * 24))
}

/** Calculate week number from a start date */
export function weekNumber(weekStartDate: string): number {
  const start = new Date(weekStartDate + 'T00:00:00Z')
  const now = new Date()
  const today = new Date(now.toISOString().split('T')[0] + 'T00:00:00Z')
  const diffDays = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(1, Math.floor(diffDays / 7) + 1)
}

/** Determine chapter health status */
export function chapterHealth(active: number, solid: number): 'red' | 'yellow' | 'green' | 'empty' {
  if (active === 0 && solid === 0) return 'empty'
  if (active > 3 && solid === 0) return 'red'
  if (solid > active) return 'green'
  return 'yellow'
}
