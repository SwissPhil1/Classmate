-- RadLoop Migration: Replace topics with Core Radiology (2021) chapters
-- Each book chapter becomes a topic with one matching default chapter

-- Clear existing data (no entities exist yet)
DELETE FROM chapters;
DELETE FROM topics;

DO $$
DECLARE
  tid UUID;
BEGIN

  -- 1. Thoracic Imaging
  INSERT INTO topics (name, exam_component) VALUES ('Imagerie thoracique', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Imagerie thoracique');

  -- 2. Gastrointestinal Imaging
  INSERT INTO topics (name, exam_component) VALUES ('Imagerie gastro-intestinale', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Imagerie gastro-intestinale');

  -- 3. Genitourinary Imaging
  INSERT INTO topics (name, exam_component) VALUES ('Imagerie génito-urinaire', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Imagerie génito-urinaire');

  -- 4. Obstetrical Imaging
  INSERT INTO topics (name, exam_component) VALUES ('Imagerie obstétricale', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Imagerie obstétricale');

  -- 5. Breast Imaging
  INSERT INTO topics (name, exam_component) VALUES ('Imagerie mammaire', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Imagerie mammaire');

  -- 6. Nuclear and Molecular Imaging
  INSERT INTO topics (name, exam_component) VALUES ('Imagerie nucléaire et moléculaire', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Imagerie nucléaire et moléculaire');

  -- 7. Cardiac Imaging
  INSERT INTO topics (name, exam_component) VALUES ('Imagerie cardiaque', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Imagerie cardiaque');

  -- 8. Vascular Imaging
  INSERT INTO topics (name, exam_component) VALUES ('Imagerie vasculaire', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Imagerie vasculaire');

  -- 9. Interventional Radiology
  INSERT INTO topics (name, exam_component) VALUES ('Radiologie interventionnelle', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Radiologie interventionnelle');

  -- 10. Neuroimaging: Brain
  INSERT INTO topics (name, exam_component) VALUES ('Neuro-imagerie : Cerveau', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Neuro-imagerie : Cerveau');

  -- 11. Neuroimaging: Head and Neck
  INSERT INTO topics (name, exam_component) VALUES ('Neuro-imagerie : Tête et cou', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Neuro-imagerie : Tête et cou');

  -- 12. Spine Imaging
  INSERT INTO topics (name, exam_component) VALUES ('Imagerie du rachis', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Imagerie du rachis');

  -- 13. Musculoskeletal Imaging
  INSERT INTO topics (name, exam_component) VALUES ('Imagerie musculo-squelettique', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Imagerie musculo-squelettique');

  -- 14. Pediatric Imaging
  INSERT INTO topics (name, exam_component) VALUES ('Imagerie pédiatrique', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Imagerie pédiatrique');

  -- 15. Imaging Physics
  INSERT INTO topics (name, exam_component) VALUES ('Physique de l''imagerie', 'both') RETURNING id INTO tid;
  INSERT INTO chapters (topic_id, name) VALUES (tid, 'Physique de l''imagerie');

END $$;
