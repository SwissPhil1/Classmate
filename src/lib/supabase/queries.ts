import { SupabaseClient } from '@supabase/supabase-js'
import type {
  Entity, EntityImage, Topic, Chapter, Source, Brief, Session, SessionState,
  TestResultRecord, UserSettings, QueueItem, EntityType, SessionType,
  TopicHealth, HealthStatus,
} from '@/lib/types'
import { chapterHealth } from '@/lib/spaced-repetition'

// ─── Topics & Chapters ───────────────────────────────────
export async function getTopics(supabase: SupabaseClient): Promise<Topic[]> {
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .order('name')
  if (error) throw error
  return data
}

export async function getChapters(supabase: SupabaseClient, topicId?: string): Promise<Chapter[]> {
  let query = supabase.from('chapters').select('*').order('name')
  if (topicId) query = query.eq('topic_id', topicId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getTopicWithChapters(supabase: SupabaseClient, topicId: string) {
  const [topicRes, chaptersRes] = await Promise.all([
    supabase.from('topics').select('*').eq('id', topicId).single(),
    supabase.from('chapters').select('*').eq('topic_id', topicId).order('name'),
  ])
  if (topicRes.error) throw topicRes.error
  if (chaptersRes.error) throw chaptersRes.error
  return { topic: topicRes.data as Topic, chapters: chaptersRes.data as Chapter[] }
}

// ─── Sources ─────────────────────────────────────────────
export async function getSources(supabase: SupabaseClient): Promise<Source[]> {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .order('is_custom')
    .order('name')
  if (error) throw error
  return data
}

export async function createSource(supabase: SupabaseClient, name: string): Promise<Source> {
  const { data, error } = await supabase
    .from('sources')
    .insert({ name, is_custom: true })
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Entities ────────────────────────────────────────────
export async function getEntities(
  supabase: SupabaseClient,
  userId: string,
  filters?: { chapterId?: string; status?: string; topicId?: string }
): Promise<Entity[]> {
  let query = supabase
    .from('entities')
    .select('*, chapter:chapters(*, topic:topics(*)), source:sources(*), brief:briefs(*)')
    .eq('user_id', userId)

  if (filters?.chapterId) query = query.eq('chapter_id', filters.chapterId)
  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.topicId) query = query.eq('chapter.topic_id', filters.topicId)

  const { data, error } = await query.order('date_flagged', { ascending: false })
  if (error) throw error
  return data as Entity[]
}

export async function getEntity(supabase: SupabaseClient, entityId: string, userId?: string): Promise<Entity> {
  let query = supabase
    .from('entities')
    .select('*, chapter:chapters(*, topic:topics(*)), source:sources(*), brief:briefs(*)')
    .eq('id', entityId)
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query.single()
  if (error) throw error
  return data as Entity
}

export async function deleteEntity(supabase: SupabaseClient, entityId: string): Promise<void> {
  const { error } = await supabase.from('entities').delete().eq('id', entityId)
  if (error) throw error
}

export async function getChildEntities(supabase: SupabaseClient, parentId: string): Promise<Entity[]> {
  const { data, error } = await supabase
    .from('entities')
    .select('*, chapter:chapters(*, topic:topics(*)), source:sources(*), brief:briefs(*)')
    .eq('parent_id', parentId)
    .order('date_flagged', { ascending: false })
  if (error) throw error
  return data as Entity[]
}

export async function createEntity(
  supabase: SupabaseClient,
  entity: {
    user_id: string
    chapter_id: string
    name: string
    entity_type: EntityType
    source_id: string
    custom_source?: string
    reference_text?: string | null
    parent_id?: string | null
  }
): Promise<Entity> {
  const { data, error } = await supabase
    .from('entities')
    .insert({
      ...entity,
      status: 'new',
      pre_test_queued: true,
      pre_test_done: false,
      correct_streak: 0,
      cycle_count: 0,
      difficulty_level: 1,
    })
    .select('*, chapter:chapters(*, topic:topics(*)), source:sources(*)')
    .single()
  if (error) throw error
  return data as Entity
}

export async function updateEntity(
  supabase: SupabaseClient,
  entityId: string,
  updates: Partial<Entity>
): Promise<void> {
  const { error } = await supabase
    .from('entities')
    .update(updates)
    .eq('id', entityId)
  if (error) throw error
}

// ─── Briefs ──────────────────────────────────────────────
export async function getBrief(supabase: SupabaseClient, entityId: string): Promise<Brief | null> {
  const { data, error } = await supabase
    .from('briefs')
    .select('*')
    .eq('entity_id', entityId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data as Brief | null
}

export async function upsertBrief(
  supabase: SupabaseClient,
  brief: { entity_id: string; content: string; qa_pairs: unknown[]; difficulty_level: number }
): Promise<Brief> {
  const { data, error } = await supabase
    .from('briefs')
    .upsert(brief, { onConflict: 'entity_id' })
    .select()
    .single()
  if (error) throw error
  return data as Brief
}

export async function updateBriefContent(
  supabase: SupabaseClient,
  entityId: string,
  content: string
): Promise<void> {
  const { error } = await supabase
    .from('briefs')
    .update({ content })
    .eq('entity_id', entityId)
  if (error) throw error
}

// ─── Sessions ────────────────────────────────────────────
export async function createSession(
  supabase: SupabaseClient,
  session: {
    user_id: string
    session_type: SessionType
    topic_filter?: string
  }
): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .insert(session)
    .select()
    .single()
  if (error) throw error
  return data as Session
}

export async function updateSession(
  supabase: SupabaseClient,
  sessionId: string,
  updates: Partial<Session>
): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', sessionId)
  if (error) throw error
}

// ─── Session State ───────────────────────────────────────
export async function getSessionState(supabase: SupabaseClient, userId: string): Promise<SessionState | null> {
  const { data, error } = await supabase
    .from('session_state')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data as SessionState | null
}

export async function upsertSessionState(
  supabase: SupabaseClient,
  state: {
    user_id: string
    session_id: string
    current_question_index: number
    queue: QueueItem[]
    answers_so_far: unknown[]
  }
): Promise<void> {
  const { error } = await supabase
    .from('session_state')
    .upsert({
      ...state,
      last_updated: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  if (error) throw error
}

export async function deleteSessionState(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase
    .from('session_state')
    .delete()
    .eq('user_id', userId)
  if (error) throw error
}

// ─── Test Results ────────────────────────────────────────
export async function createTestResult(
  supabase: SupabaseClient,
  result: {
    id?: string
    entity_id: string
    session_id: string | null
    question_text: string
    question_type: string
    user_answer: string | null
    result: string
    auto_evaluated: boolean
    feedback: string | null
    is_pretest: boolean
    interleaved_session: boolean
  }
): Promise<TestResultRecord> {
  const { data, error } = await supabase
    .from('test_results')
    .insert(result)
    .select()
    .single()
  if (error) throw error
  return data as TestResultRecord
}

export async function getTestResults(
  supabase: SupabaseClient,
  filters: { entityId?: string; sessionId?: string; dateFrom?: string; dateTo?: string }
): Promise<TestResultRecord[]> {
  let query = supabase.from('test_results').select('*, entity:entities(name, chapter_id, chapter:chapters(name, topic:topics(name))), session:sessions(session_type)')
  if (filters.entityId) query = query.eq('entity_id', filters.entityId)
  if (filters.sessionId) query = query.eq('session_id', filters.sessionId)
  if (filters.dateFrom) query = query.gte('date', filters.dateFrom)
  if (filters.dateTo) query = query.lte('date', filters.dateTo)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return data as TestResultRecord[]
}

// ─── User Settings ───────────────────────────────────────
export async function getUserSettings(supabase: SupabaseClient, userId: string): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data as UserSettings | null
}

export async function upsertUserSettings(
  supabase: SupabaseClient,
  settings: Partial<UserSettings> & { user_id: string }
): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .upsert(settings, { onConflict: 'user_id' })
    .select()
    .single()
  if (error) throw error
  return data as UserSettings
}

// ─── Dashboard Queries ───────────────────────────────────
export async function getDueCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0]
  const { count, error } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lte('next_test_date', today)
    .in('status', ['active', 'new'])
  if (error) throw error
  return count ?? 0
}

export async function getPretestCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('pre_test_queued', true)
  if (error) throw error
  return count ?? 0
}

export async function getTopicHealthGrid(
  supabase: SupabaseClient,
  userId: string
): Promise<TopicHealth[]> {
  const [topics, chapters, entities] = await Promise.all([
    getTopics(supabase),
    supabase.from('chapters').select('*').order('name'),
    supabase.from('entities').select('id, chapter_id, status').eq('user_id', userId),
  ])

  if (chapters.error) throw chapters.error
  if (entities.error) throw entities.error

  const chapterMap = new Map<string, Chapter[]>()
  for (const ch of chapters.data as Chapter[]) {
    const list = chapterMap.get(ch.topic_id) || []
    list.push(ch)
    chapterMap.set(ch.topic_id, list)
  }

  const entityByChapter = new Map<string, { active: number; solid: number; archived: number }>()
  for (const e of entities.data as Pick<Entity, 'id' | 'chapter_id' | 'status'>[]) {
    const stats = entityByChapter.get(e.chapter_id) || { active: 0, solid: 0, archived: 0 }
    if (e.status === 'active' || e.status === 'new') stats.active++
    else if (e.status === 'solid') stats.solid++
    else if (e.status === 'archived') stats.archived++
    entityByChapter.set(e.chapter_id, stats)
  }

  return topics.map(topic => {
    const topicChapters = chapterMap.get(topic.id) || []
    const chapterHealthList = topicChapters.map(ch => {
      const stats = entityByChapter.get(ch.id) || { active: 0, solid: 0, archived: 0 }
      return {
        chapter: ch,
        ...stats,
        health: chapterHealth(stats.active, stats.solid) as HealthStatus,
      }
    })

    // Overall topic health
    const totalActive = chapterHealthList.reduce((s, c) => s + c.active, 0)
    const totalSolid = chapterHealthList.reduce((s, c) => s + c.solid, 0)
    const overallHealth = chapterHealth(totalActive, totalSolid) as HealthStatus

    return { topic, chapters: chapterHealthList, overallHealth }
  })
}

// ─── Weak Items Count ───────────────────────────────────
export async function getWeakCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['active'])
    .lte('correct_streak', 1)
    .eq('pre_test_done', true)
    .eq('pre_test_queued', false)
  if (error) throw error
  return count ?? 0
}

// ─── Session Queue Assembly ──────────────────────────────
export async function assembleQueue(
  supabase: SupabaseClient,
  userId: string,
  sessionType: SessionType,
  topicFilter?: string,
  interleavingEnabled: boolean = false
): Promise<QueueItem[]> {
  const today = new Date().toISOString().split('T')[0]
  const queue: QueueItem[] = []

  // 0. Get parent IDs — graceful fallback if parent_id column not yet migrated
  let parentIds = new Set<string>()
  try {
    const { data: childRows } = await supabase
      .from('entities')
      .select('parent_id')
      .eq('user_id', userId)
      .not('parent_id', 'is', null)
    parentIds = new Set((childRows || []).map(r => r.parent_id).filter(Boolean))
  } catch {
    // parent_id column may not exist yet — proceed without synthesis flags
  }

  // 1. Pre-tests first
  const { data: pretestEntities, error: pretestErr } = await supabase
    .from('entities')
    .select('id, entity_type, name')
    .eq('user_id', userId)
    .eq('pre_test_queued', true)

  if (pretestErr) throw pretestErr
  for (const e of pretestEntities || []) {
    queue.push({
      entity_id: e.id,
      question_type: null, // determined at serve time by pretest API
      is_pretest: true,
    })
  }

  // 2. Build entity query for regular queue
  let entityQuery = supabase
    .from('entities')
    .select('id, entity_type, name, next_test_date, cycle_count, chapter_id, chapter:chapters(topic_id)')
    .eq('user_id', userId)
    .eq('pre_test_queued', false)
    .in('status', ['active', 'new'])

  if (sessionType === 'weak_items') {
    // Weak items: struggling entities regardless of next_test_date
    entityQuery = entityQuery.lte('correct_streak', 1).eq('pre_test_done', true)
  } else {
    entityQuery = entityQuery.not('next_test_date', 'is', null).lte('next_test_date', today)
  }

  if (sessionType === 'topic_study' && topicFilter) {
    // Get chapter IDs for this topic
    const { data: topicChapters } = await supabase
      .from('chapters')
      .select('id')
      .eq('topic_id', topicFilter)
    if (topicChapters) {
      entityQuery = entityQuery.in('chapter_id', topicChapters.map(c => c.id))
    }
  }

  const { data: dueEntities, error: dueErr } = await entityQuery.order('next_test_date', { ascending: true })
  if (dueErr) throw dueErr

  // Sort: overdue first (by days overdue desc), then due today
  const sorted = (dueEntities || []).sort((a, b) => {
    const aDate = new Date(a.next_test_date).getTime()
    const bDate = new Date(b.next_test_date).getTime()
    return aDate - bDate // oldest first = most overdue first
  })

  // Interleaving: shuffle topics if enabled
  let finalList = sorted
  if (interleavingEnabled && sessionType !== 'topic_study') {
    finalList = interleaveByTopic(sorted)
  }

  for (const e of finalList) {
    queue.push({
      entity_id: e.id,
      question_type: null, // determined at serve time
      is_pretest: false,
      is_synthesis: parentIds.has(e.id),
    })
  }

  // Cap based on session type
  const cap = sessionType === 'short' ? 20
    : sessionType === 'weekend' ? 40
    : sessionType === 'topic_study' ? Infinity
    : sessionType === 'weak_items' ? 15
    : 30 // reviews

  // Pre-tests are always included, cap applies to regular queue only
  const pretestCount = queue.filter(q => q.is_pretest).length
  const regularItems = queue.filter(q => !q.is_pretest)
  const cappedRegular = regularItems.slice(0, cap)

  return [...queue.filter(q => q.is_pretest), ...cappedRegular]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function interleaveByTopic<T extends Record<string, any>>(entities: T[]): T[] {
  const byTopic = new Map<string, T[]>()
  for (const e of entities) {
    const chapter = e.chapter as Array<{ topic_id: string }> | { topic_id: string } | null
    const topicId = (Array.isArray(chapter) ? chapter[0]?.topic_id : chapter?.topic_id) || 'unknown'
    const list = byTopic.get(topicId) || []
    list.push(e)
    byTopic.set(topicId, list)
  }

  const result: T[] = []
  const topics = Array.from(byTopic.values())
  let maxLen = Math.max(...topics.map(t => t.length), 0)
  for (let i = 0; i < maxLen; i++) {
    for (const topicEntities of topics) {
      if (i < topicEntities.length) {
        result.push(topicEntities[i])
      }
    }
  }
  return result
}

// ─── Entity Images ──────────────────────────────────────
export async function getEntityImages(
  supabase: SupabaseClient,
  entityId: string
): Promise<EntityImage[]> {
  const { data, error } = await supabase
    .from('entity_images')
    .select('*')
    .eq('entity_id', entityId)
    .order('display_order')
    .order('created_at')
  if (error) throw error
  return data as EntityImage[]
}

export async function createEntityImage(
  supabase: SupabaseClient,
  image: {
    entity_id: string
    user_id: string
    storage_path: string
    caption?: string | null
    modality?: string | null
    display_order?: number
  }
): Promise<EntityImage> {
  const { data, error } = await supabase
    .from('entity_images')
    .insert(image)
    .select('*')
    .single()
  if (error) throw error
  return data as EntityImage
}

export async function updateEntityImage(
  supabase: SupabaseClient,
  imageId: string,
  updates: { caption?: string | null; modality?: string | null; display_order?: number }
): Promise<void> {
  const { error } = await supabase
    .from('entity_images')
    .update(updates)
    .eq('id', imageId)
  if (error) throw error
}

export async function deleteEntityImage(
  supabase: SupabaseClient,
  imageId: string
): Promise<void> {
  const { error } = await supabase
    .from('entity_images')
    .delete()
    .eq('id', imageId)
  if (error) throw error
}
