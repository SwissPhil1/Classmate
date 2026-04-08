-- RadLoop Database Schema
-- Run this in Supabase SQL Editor to create all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Topics ──────────────────────────────────────────────
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  exam_component TEXT NOT NULL CHECK (exam_component IN ('oral', 'written', 'both')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Chapters ────────────────────────────────────────────
CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chapters_topic ON chapters(topic_id);

-- ─── Sources ─────────────────────────────────────────────
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  is_custom BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Entities ────────────────────────────────────────────
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('single_diagnosis', 'ddx_pair', 'concept', 'protocol')),
  source_id UUID REFERENCES sources(id),
  custom_source TEXT,
  date_flagged DATE DEFAULT CURRENT_DATE,
  last_tested TIMESTAMPTZ,
  next_test_date DATE,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'active', 'solid', 'archived')),
  correct_streak INTEGER NOT NULL DEFAULT 0,
  cycle_count INTEGER NOT NULL DEFAULT 0,
  pre_test_done BOOLEAN NOT NULL DEFAULT FALSE,
  pre_test_queued BOOLEAN NOT NULL DEFAULT FALSE,
  difficulty_level INTEGER NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 3),
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_user ON entities(user_id);
CREATE INDEX idx_entities_chapter ON entities(chapter_id);
CREATE INDEX idx_entities_status ON entities(status);
CREATE INDEX idx_entities_next_test ON entities(next_test_date);
CREATE INDEX idx_entities_pretest ON entities(pre_test_queued) WHERE pre_test_queued = TRUE;

-- ─── Briefs ──────────────────────────────────────────────
CREATE TABLE briefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  qa_pairs JSONB NOT NULL DEFAULT '[]',
  difficulty_level INTEGER NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_briefs_entity ON briefs(entity_id);

-- ─── Sessions ────────────────────────────────────────────
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  session_type TEXT NOT NULL CHECK (session_type IN ('short', 'weekend', 'topic_study', 'weekly_review', 'monthly_review')),
  topic_filter UUID REFERENCES topics(id),
  entities_tested INTEGER NOT NULL DEFAULT 0,
  results_summary JSONB NOT NULL DEFAULT '{"correct": 0, "partial": 0, "wrong": 0}',
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  resumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ─── Test Results ────────────────────────────────────────
CREATE TABLE test_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  date DATE DEFAULT CURRENT_DATE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('A_typed', 'B_open', 'C_freeresponse')),
  user_answer TEXT,
  result TEXT NOT NULL CHECK (result IN ('correct', 'partial', 'wrong')),
  auto_evaluated BOOLEAN NOT NULL DEFAULT FALSE,
  feedback TEXT,
  is_pretest BOOLEAN NOT NULL DEFAULT FALSE,
  image_url TEXT,
  interleaved_session BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_results_entity ON test_results(entity_id);
CREATE INDEX idx_results_session ON test_results(session_id);
CREATE INDEX idx_results_date ON test_results(date);

-- ─── Session State ───────────────────────────────────────
CREATE TABLE session_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  current_question_index INTEGER NOT NULL DEFAULT 0,
  queue JSONB NOT NULL DEFAULT '[]',
  answers_so_far JSONB NOT NULL DEFAULT '[]',
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_session_state_user ON session_state(user_id);

-- ─── User Settings ───────────────────────────────────────
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY,
  exam_date_written DATE NOT NULL DEFAULT '2026-08-26',
  exam_date_oral_start DATE NOT NULL DEFAULT '2026-08-27',
  exam_date_oral_end DATE NOT NULL DEFAULT '2026-08-28',
  interleaving_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  interleaving_suggested BOOLEAN NOT NULL DEFAULT FALSE,
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  week_start_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Row Level Security (disabled for single user V1) ────
-- Enable RLS but with permissive policies for simplicity
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users (single user V1)
CREATE POLICY "Allow all for authenticated" ON topics FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON chapters FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON sources FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON entities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON briefs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON test_results FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON session_state FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON user_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Also allow anon for reading topics/chapters/sources (pre-seeded data)
CREATE POLICY "Allow anon read topics" ON topics FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read chapters" ON chapters FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read sources" ON sources FOR SELECT TO anon USING (true);
