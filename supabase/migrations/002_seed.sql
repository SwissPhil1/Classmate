-- RadLoop Seed Data: Topics, Chapters, Sources
-- Run this AFTER 001_schema.sql

-- ─── Sources ─────────────────────────────────────────────
INSERT INTO sources (name, is_custom) VALUES
  ('Top 3 Differentials', false),
  ('RadPrimer', false),
  ('Aunt Minnie''s', false),
  ('Cas clinique (travail)', false),
  ('Autre', false);

-- ─── Helper: insert topic + chapters ─────────────────────
-- We use a DO block to capture topic IDs for chapter inserts

DO $$
DECLARE
  tid UUID;
BEGIN

  -- 1. Neuroradiologie [both]
  INSERT INTO topics (name, exam_component) VALUES ('Neuroradiologie', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES
    (tid, 'Tumeurs cérébrales (adulte)'),
    (tid, 'Tumeurs cérébrales (pédiatrique)'),
    (tid, 'Substance blanche et démyélinisation'),
    (tid, 'AVC et pathologie vasculaire'),
    (tid, 'Infections et inflammation du SNC'),
    (tid, 'Traumatisme crânien'),
    (tid, 'Base du crâne et nerfs crâniens'),
    (tid, 'Rachis et moelle épinière'),
    (tid, 'Tête et cou');

  -- 2. Thoracique [both]
  INSERT INTO topics (name, exam_component) VALUES ('Thoracique', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES
    (tid, 'Parenchyme pulmonaire et PID'),
    (tid, 'Voies aériennes et BPCO'),
    (tid, 'Plèvre'),
    (tid, 'Médiastin'),
    (tid, 'Cœur et péricarde'),
    (tid, 'Vasculaire thoracique');

  -- 3. Musculo-squelettique [both]
  INSERT INTO topics (name, exam_component) VALUES ('Musculo-squelettique', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES
    (tid, 'Tumeurs osseuses'),
    (tid, 'Arthrites et dépôts cristallins'),
    (tid, 'Traumatismes et fractures'),
    (tid, 'Infections osseuses et ostéomyélite'),
    (tid, 'Tumeurs des tissus mous'),
    (tid, 'Rachis (MSK)');

  -- 4. Gastro-intestinal [both]
  INSERT INTO topics (name, exam_component) VALUES ('Gastro-intestinal', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES
    (tid, 'Œsophage et estomac'),
    (tid, 'Grêle'),
    (tid, 'Côlon et rectum'),
    (tid, 'Foie'),
    (tid, 'Voies biliaires et vésicule'),
    (tid, 'Pancréas'),
    (tid, 'Rate'),
    (tid, 'Péritoine et mésentère');

  -- 5. Génito-urinaire [both]
  INSERT INTO topics (name, exam_component) VALUES ('Génito-urinaire', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES
    (tid, 'Reins et uretères'),
    (tid, 'Vessie et urètre'),
    (tid, 'Génital masculin'),
    (tid, 'Génital féminin'),
    (tid, 'Surrénales'),
    (tid, 'Rétropéritoine');

  -- 6. Imagerie mammaire [both]
  INSERT INTO topics (name, exam_component) VALUES ('Imagerie mammaire', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES
    (tid, 'Masses et asymétries'),
    (tid, 'Calcifications'),
    (tid, 'Distorsion architecturale'),
    (tid, 'Post-thérapeutique');

  -- 7. Pédiatrie [both]
  INSERT INTO topics (name, exam_component) VALUES ('Pédiatrie', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES
    (tid, 'Neuroradiologie pédiatrique'),
    (tid, 'Thorax pédiatrique'),
    (tid, 'Abdomen et digestif pédiatrique'),
    (tid, 'MSK pédiatrique'),
    (tid, 'Néonatal et congénital');

  -- 8. Cardiovasculaire [both]
  INSERT INTO topics (name, exam_component) VALUES ('Cardiovasculaire', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES
    (tid, 'Cardiopathies congénitales'),
    (tid, 'Cardiopathies acquises'),
    (tid, 'Aorte et grands vaisseaux'),
    (tid, 'Vasculaire périphérique');

  -- 9. Radiologie interventionnelle [oral]
  INSERT INTO topics (name, exam_component) VALUES ('Radiologie interventionnelle', 'oral') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES
    (tid, 'IR vasculaire'),
    (tid, 'IR oncologique'),
    (tid, 'IR non vasculaire'),
    (tid, 'Drainage et biopsie');

  -- 10. Médecine nucléaire [both]
  INSERT INTO topics (name, exam_component) VALUES ('Médecine nucléaire', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES
    (tid, 'Oncologie et TEP'),
    (tid, 'Thyroïde et parathyroïde'),
    (tid, 'Scintigraphie osseuse'),
    (tid, 'Nucléaire cardiaque'),
    (tid, 'Autres systèmes');

  -- 11. Échographie [both]
  INSERT INTO topics (name, exam_component) VALUES ('Échographie', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES
    (tid, 'Échographie abdominale'),
    (tid, 'Doppler vasculaire'),
    (tid, 'Échographie gynéco-obstétricale'),
    (tid, 'Structures superficielles'),
    (tid, 'Échographie d''urgence');

  -- 12. Urgences et traumatologie [both]
  INSERT INTO topics (name, exam_component) VALUES ('Urgences et traumatologie', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES
    (tid, 'Neurotraumatologie'),
    (tid, 'Traumatisme thoracique'),
    (tid, 'Traumatisme abdominal'),
    (tid, 'Traumatisme MSK'),
    (tid, 'Abdomen aigu');

  -- 13. Physique et radiobiologie [written]
  INSERT INTO topics (name, exam_component) VALUES ('Physique et radiobiologie', 'written') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES
    (tid, 'Radiographie et radioscopie'),
    (tid, 'Physique du scanner'),
    (tid, 'Physique de l''IRM'),
    (tid, 'Physique de l''échographie'),
    (tid, 'Physique de la médecine nucléaire'),
    (tid, 'Radioprotection et dosimétrie'),
    (tid, 'Radiobiologie');

END $$;
