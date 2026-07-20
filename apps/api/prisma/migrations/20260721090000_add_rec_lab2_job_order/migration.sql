-- Rec Lab 2: persists the actual sorted job order (not just a "sorted
-- already" flag) alongside recLab2SortHash, so a request that gets
-- cancelled after the sort is computed and saved server-side, but before
-- the client receives it, doesn't leave future loads stuck showing the
-- unsorted fallback order forever. See rec-lab2.service.ts.
ALTER TABLE "cv_profiles" ADD COLUMN "recLab2JobOrder" JSONB NOT NULL DEFAULT '[]';
