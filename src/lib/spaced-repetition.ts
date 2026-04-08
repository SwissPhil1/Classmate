import type { Entity, TestResult, DifficultyLevel } from './types'

/** SM-2 adapted intervals for RadLoop */
const STREAK_INTERVALS: Record<number, number> = {
  0: 3,   // first correct: +3 days
  1: 7,   // second correct: +7 days
  2: 16,  // third correct: +16 days
  3: 0,   // fourth correct: archived (no more tests)
}

interface SpacedRepetitionUpdate {
  correct_streak: number
  next_test_date: string | null
  status: Entity['status']
  difficulty_level: DifficultyLevel
  last_tested: string
  cycle_count: number
}

export function calculateNextReview(
  entity: Pick<Entity, 'correct_streak' | 'difficulty_level' | 'status' | 'cycle_count'>,
  result: TestResult
): SpacedRepetitionUpdate {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  let { correct_streak, difficulty_level, cycle_count } = entity

  // Always increment cycle count
  cycle_count += 1

  if (result === 'correct') {
    correct_streak += 1

    if (correct_streak >= 4) {
      return {
        correct_streak: 4,
        next_test_date: null,
        status: 'archived',
        difficulty_level,
        last_tested: now.toISOString(),
        cycle_count,
      }
    }

    const daysToAdd = STREAK_INTERVALS[correct_streak - 1] ?? 16
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
    // Streak unchanged, +2 days
    const nextDate = addDays(today, 2)
    return {
      correct_streak,
      next_test_date: nextDate,
      status: 'active',
      difficulty_level,
      last_tested: now.toISOString(),
      cycle_count,
    }
  }

  // Wrong: streak drops by 1, next = tomorrow, difficulty +1
  correct_streak = Math.max(0, correct_streak - 1)
  difficulty_level = Math.min(3, difficulty_level + 1) as DifficultyLevel
  const nextDate = addDays(today, 1)

  return {
    correct_streak,
    next_test_date: nextDate,
    status: 'active',
    difficulty_level,
    last_tested: now.toISOString(),
    cycle_count,
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/** Calculate days until a target date from today */
export function daysUntil(targetDate: string): number {
  const target = new Date(targetDate + 'T00:00:00Z')
  const now = new Date()
  const today = new Date(now.toISOString().split('T')[0] + 'T00:00:00Z')
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
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
