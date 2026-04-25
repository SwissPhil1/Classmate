// ─── Enums ───────────────────────────────────────────────
export type EntityType = 'single_diagnosis' | 'ddx_pair' | 'concept' | 'protocol'
export type EntityStatus = 'new' | 'active' | 'solid' | 'archived'
export type ExamComponent = 'oral' | 'written' | 'both'
export type QuestionType = 'A_typed' | 'B_open' | 'C_freeresponse'
export type TestResult = 'correct' | 'partial' | 'wrong'
export type SessionType = 'short' | 'weekend' | 'topic_study' | 'weekly_review' | 'monthly_review' | 'weak_items'
export type ThemeMode = 'dark' | 'light'
export type DifficultyLevel = 1 | 2 | 3
export type ImageModality = 'CT' | 'IRM' | 'RX' | 'US' | 'UIV' | 'angio' | 'autre'
export type MRISequence = 'T1' | 'T2' | 'STIR' | 'DWI' | 'T1 FS' | 'T2 FS' | 'T1 GADO'

/** Claude-generated brief computed once at upload, reused at quiz time. */
export interface ImageAIBrief {
  diagnostic_likely: string
  top_3_ddx: Array<{ dx: string; distinguishing_feature: string }>
  semiologic_findings: string[]
  modality_inferred: ImageModality | null
  pitfalls: string[]
}

export type ImageAIBriefStatus = 'pending' | 'analyzing' | 'done' | 'error'

export type ImageReviewStatus = 'new' | 'active' | 'solid' | 'archived'

/** Per-(image, user) SRS state — Phase 2 image quiz. */
export interface ImageReviewState {
  id: string
  image_id: string
  user_id: string
  correct_streak: number
  difficulty_level: DifficultyLevel
  cycle_count: number
  status: ImageReviewStatus
  next_review_date: string | null
  last_reviewed: string | null
  total_reviews: number
  created_at: string
}
export type Priority = 'normal' | 'vital'
export type PrioritySource = 'auto' | 'manual'

// ─── Database Models ─────────────────────────────────────
export interface Topic {
  id: string
  name: string
  exam_component: ExamComponent
}

export interface Chapter {
  id: string
  topic_id: string
  name: string
  topic?: Topic
  /** Long-form markdown reference for the whole chapter (pasted by the user
   *  from a textbook or a Claude-desktop batched write-up). Entities can link
   *  to a specific `## Section` inside this manual via
   *  `manual_section_anchor`. Null if the user hasn't populated one. */
  manual_content?: string | null
}

export interface Source {
  id: string
  name: string
  is_custom: boolean
}

export interface Entity {
  id: string
  user_id: string
  chapter_id: string
  parent_id: string | null
  name: string
  entity_type: EntityType
  source_id: string
  custom_source: string | null
  date_flagged: string
  last_tested: string | null
  next_test_date: string | null
  status: EntityStatus
  correct_streak: number
  cycle_count: number
  pre_test_done: boolean
  pre_test_queued: boolean
  difficulty_level: DifficultyLevel
  priority: Priority
  priority_source: PrioritySource | null
  has_mnemonic: boolean
  mnemonic_name: string | null
  image_url: string | null
  notes: string | null
  reference_text: string | null
  /** Name of a `## Section` heading inside this entity's chapter `manual_content`.
   *  When set, the brief generator and drill reveal use this section of the
   *  chapter manual as the dominant reference instead of the legacy per-entity
   *  reference_text. Null until the user (or auto-linker) wires it up. */
  manual_section_anchor: string | null
  pretest_question: { type: string; question: string; model_answer: string; key_points: string[] } | null
  // Joined fields
  chapter?: Chapter
  topic?: Topic
  source?: Source
  brief?: Brief
  children?: Entity[]
  images?: EntityImage[]
}

export interface EntityImage {
  id: string
  entity_id: string
  user_id: string
  storage_path: string
  caption: string | null
  modality: ImageModality | null
  display_order: number
  created_at: string
  // Phase 1 image-library extensions (migration 016).
  // Older rows have NULL for dimensions/file_size_bytes (no retro-compression).
  display_name: string | null
  tags: string[]
  sequence: string | null
  source_url: string | null
  width: number | null
  height: number | null
  file_size_bytes: number | null
  is_cover: boolean
  // Phase 1.5 — AI brief (migration 017).
  ai_brief: ImageAIBrief | null
  ai_brief_status: ImageAIBriefStatus
  ai_brief_error: string | null
  ai_brief_generated_at: string | null
  url?: string // derived signed URL, not in DB
}

export type EntityEventKind =
  | 'reference_added'
  | 'claude_regenerated'
  | 'claude_merged'
  | 'anchor_linked'
  | 'anchor_unlinked'
  | 'brief_reverted'

export interface EntityEvent {
  id: string
  entity_id: string
  user_id: string
  kind: EntityEventKind
  source_label: string | null
  diff_summary: string | null
  created_at: string
}

export interface QAPair {
  question: string
  model_answer: string
  key_points: string[]
}

export interface Brief {
  id: string
  entity_id: string
  user_id: string
  content: string
  /** Snapshot of `content` before the most recent Claude-driven change.
   *  Populated on every merge/regen so the user can undo. Null when the
   *  brief has never been Claude-modified. */
  content_previous: string | null
  qa_pairs: QAPair[]
  difficulty_level: DifficultyLevel
  created_at: string
}

export interface TestResultRecord {
  id: string
  entity_id: string
  user_id: string
  session_id: string | null
  date: string
  question_text: string
  question_type: QuestionType
  user_answer: string | null
  result: TestResult
  auto_evaluated: boolean
  feedback: string | null
  is_pretest: boolean
  image_url: string | null
  interleaved_session: boolean
  confidence?: number | null
  entity?: Entity | { name: string; chapter_id: string; chapter?: { name: string; topic?: { name: string } } }
  session?: { session_type: SessionType } | null
  created_at?: string
}

export interface Session {
  id: string
  user_id: string
  date: string
  session_type: SessionType
  topic_filter: string | null
  entities_tested: number
  results_summary: {
    correct: number
    partial: number
    wrong: number
  }
  completed: boolean
  resumed_at: string | null
}

export interface QueueItem {
  entity_id: string
  question_type: QuestionType | null
  is_pretest: boolean
  is_synthesis?: boolean
  question?: string
  model_answer?: string
  key_points?: string[]
  image_urls?: string[]
}

export interface SessionState {
  id: string
  user_id: string
  session_id: string
  current_question_index: number
  queue: QueueItem[]
  answers_so_far: AnswerRecord[]
  last_updated: string
}

export interface AnswerRecord {
  entity_id: string
  entity_name?: string
  topic_name?: string
  question_text: string
  question_type: QuestionType
  user_answer: string | null
  result: TestResult
  feedback: string | null
  is_pretest: boolean
  confidence?: number
}

export interface BriefAuditItem {
  entity_id: string
  status: 'ok' | 'needs_fix'
  gaps: string[]
  suggested_grouping: string | null
  /** Claude's suggestion for a better chapter match, if the entity looks
   *  misclassified. Null when the current chapter is fine. */
  suggested_chapter_id: string | null
  suggested_chapter_name: string | null
  suggested_chapter_topic: string | null
  ignored: boolean
}

export interface BriefAuditReport {
  generated_at: string
  items: BriefAuditItem[]
}

export interface UserSettings {
  user_id: string
  exam_date_written: string
  exam_date_oral_start: string
  exam_date_oral_end: string
  interleaving_enabled: boolean
  interleaving_suggested: boolean
  theme: ThemeMode
  week_start_date: string | null
  last_audit: BriefAuditReport | null
}

// ─── API Response Types ──────────────────────────────────
export interface ClaudePretestResponse {
  type: 'A' | 'B'
  question: string
  model_answer: string
  key_points: string[]
}

export interface ClaudeBriefResponse {
  content: string
  qa_pairs: QAPair[]
}

export interface ClaudeQuestionResponse {
  type: 'A' | 'B' | 'C'
  question: string
  model_answer: string
  key_points: string[]
  difficulty_used: number
}

export interface ClaudeEvaluateResponse {
  result: TestResult
  feedback: string
  missing: string[]
  oral_tip: string | null
}

// ─── Dashboard Types ─────────────────────────────────────
export type HealthStatus = 'red' | 'yellow' | 'green' | 'empty'

export interface TopicHealth {
  topic: Topic
  chapters: {
    chapter: Chapter
    active: number
    solid: number
    archived: number
    health: HealthStatus
  }[]
  overallHealth: HealthStatus
}
