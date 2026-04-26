import type { Entity, EntityStatus, TestResult, TestResultRecord } from './types'

// ─── Status counts ───────────────────────────────────────
export interface StatusCounts {
  new: number
  active: number
  solid: number
  archived: number
}

export function aggregateStatusCounts(entities: Pick<Entity, 'status'>[]): StatusCounts {
  const counts: StatusCounts = { new: 0, active: 0, solid: 0, archived: 0 }
  for (const e of entities) {
    counts[e.status as EntityStatus] = (counts[e.status as EntityStatus] ?? 0) + 1
  }
  return counts
}

// ─── Global accuracy ─────────────────────────────────────
export interface GlobalAccuracy {
  correct: number
  partial: number
  wrong: number
  total: number
  pctCorrect: number
}

export function aggregateGlobalAccuracy(results: Pick<TestResultRecord, 'result'>[]): GlobalAccuracy {
  const acc = { correct: 0, partial: 0, wrong: 0 }
  for (const r of results) {
    if (r.result === 'correct') acc.correct++
    else if (r.result === 'partial') acc.partial++
    else if (r.result === 'wrong') acc.wrong++
  }
  const total = acc.correct + acc.partial + acc.wrong
  const pctCorrect = total === 0 ? 0 : Math.round((acc.correct / total) * 100)
  return { ...acc, total, pctCorrect }
}

// ─── Topic accuracy ──────────────────────────────────────
export interface TopicAccuracy {
  topicName: string
  correct: number
  total: number
  pct: number
}

type EntityShape = { chapter?: { topic?: { name?: string } | null } | null }

function extractTopicName(r: Pick<TestResultRecord, 'entity'>): string | null {
  const ent = r.entity as EntityShape | undefined
  return ent?.chapter?.topic?.name ?? null
}

export function aggregateTopicAccuracy(
  results: Pick<TestResultRecord, 'entity' | 'result'>[],
  minTests = 5
): TopicAccuracy[] {
  const byTopic = new Map<string, { correct: number; total: number }>()
  for (const r of results) {
    const topic = extractTopicName(r)
    if (!topic) continue
    const bucket = byTopic.get(topic) ?? { correct: 0, total: 0 }
    bucket.total++
    if (r.result === 'correct') bucket.correct++
    byTopic.set(topic, bucket)
  }
  const out: TopicAccuracy[] = []
  for (const [topicName, { correct, total }] of byTopic) {
    if (total < minTests) continue
    out.push({ topicName, correct, total, pct: Math.round((correct / total) * 100) })
  }
  return out.sort((a, b) => b.pct - a.pct)
}

// ─── Weak entities ranking ───────────────────────────────
export interface WeakEntityRow {
  entity: Entity
  recentCorrect: number
  recentTotal: number
  lastTested: string | null
}

export function rankWeakEntities(
  entities: Entity[],
  results: TestResultRecord[],
  limit = 10
): WeakEntityRow[] {
  const weak = entities.filter(
    (e) => e.status === 'active' && e.correct_streak <= 1 && e.pre_test_done
  )

  // Group results by entity, keep last 5 chronologically
  const byEntity = new Map<string, TestResultRecord[]>()
  const sorted = [...results].sort((a, b) => {
    const at = new Date(a.created_at || a.date || 0).getTime()
    const bt = new Date(b.created_at || b.date || 0).getTime()
    return bt - at // desc (newest first)
  })
  for (const r of sorted) {
    const list = byEntity.get(r.entity_id) ?? []
    if (list.length < 5) list.push(r)
    byEntity.set(r.entity_id, list)
  }

  const rows: WeakEntityRow[] = weak.map((entity) => {
    const recent = byEntity.get(entity.id) ?? []
    const recentCorrect = recent.filter((r) => r.result === 'correct').length
    return {
      entity,
      recentCorrect,
      recentTotal: recent.length,
      lastTested: entity.last_tested,
    }
  })

  // Sort: lowest recent success rate first, then oldest last_tested
  rows.sort((a, b) => {
    const rateA = a.recentTotal === 0 ? 0 : a.recentCorrect / a.recentTotal
    const rateB = b.recentTotal === 0 ? 0 : b.recentCorrect / b.recentTotal
    if (rateA !== rateB) return rateA - rateB
    const ta = a.lastTested ? new Date(a.lastTested).getTime() : 0
    const tb = b.lastTested ? new Date(b.lastTested).getTime() : 0
    return ta - tb // oldest (smallest ts) first
  })

  return rows.slice(0, limit)
}

// ─── Recently tested entities ────────────────────────────
export interface RecentEntityRow {
  entity: Entity
  lastResult: TestResult
  lastTested: string
}

export function recentlyTestedEntities(
  entities: Entity[],
  results: TestResultRecord[],
  limit = 15,
  withinDays = 7
): RecentEntityRow[] {
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000
  const entitiesById = new Map(entities.map((e) => [e.id, e]))

  const sorted = [...results]
    .filter((r) => {
      const ts = new Date(r.created_at || r.date || 0).getTime()
      return ts >= cutoff
    })
    .sort((a, b) => {
      const at = new Date(a.created_at || a.date || 0).getTime()
      const bt = new Date(b.created_at || b.date || 0).getTime()
      return bt - at
    })

  const seen = new Set<string>()
  const out: RecentEntityRow[] = []
  for (const r of sorted) {
    if (seen.has(r.entity_id)) continue
    const entity = entitiesById.get(r.entity_id)
    if (!entity) continue
    seen.add(r.entity_id)
    out.push({
      entity,
      lastResult: r.result,
      lastTested: r.created_at || r.date || '',
    })
    if (out.length >= limit) break
  }
  return out
}

// ─── Utility: relative date formatting ───────────────────
export function formatRelativeDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  if (diffDays === 0) return "aujourd'hui"
  if (diffDays === 1) return 'hier'
  if (diffDays < 7) return `il y a ${diffDays}j`
  if (diffDays < 30) return `il y a ${Math.floor(diffDays / 7)}sem`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
