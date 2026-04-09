// ─── Enums ───────────────────────────────────────────────
export type EntityType = 'single_diagnosis' | 'ddx_pair' | 'concept' | 'protocol'
export type EntityStatus = 'new' | 'active' | 'solid' | 'archived'
export type ExamComponent = 'oral' | 'written' | 'both'
export type QuestionType = 'A_typed' | 'B_open' | 'C_freeresponse'
export type TestResult = 'correct' | 'partial' | 'wrong'
export type SessionType = 'short' | 'weekend' | 'topic_study' | 'weekly_review' | 'monthly_review'
export type ThemeMode = 'dark' | 'light'
export type DifficultyLevel = 1 | 2 | 3

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
  image_url: string | null
  notes: string | null
  reference_text: string | null
  pretest_question: { type: string; question: string; model_answer: string; key_points: string[] } | null
  // Joined fields
  chapter?: Chapter
  topic?: Topic
  source?: Source
  brief?: Brief
}

export interface QAPair {
  question: string
  model_answer: string
  key_points: string[]
}

export interface Brief {
  id: string
  entity_id: string
  content: string
  qa_pairs: QAPair[]
  difficulty_level: DifficultyLevel
  created_at: string
}

export interface TestResultRecord {
  id: string
  entity_id: string
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
  entity?: Entity
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
  question?: string
  model_answer?: string
  key_points?: string[]
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
  question_text: string
  question_type: QuestionType
  user_answer: string | null
  result: TestResult
  feedback: string | null
  is_pretest: boolean
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
