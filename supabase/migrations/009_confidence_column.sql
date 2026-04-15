-- Add confidence rating to test_results (1-5 scale, nullable)
ALTER TABLE test_results ADD COLUMN confidence SMALLINT CHECK (confidence IS NULL OR (confidence >= 1 AND confidence <= 5));
