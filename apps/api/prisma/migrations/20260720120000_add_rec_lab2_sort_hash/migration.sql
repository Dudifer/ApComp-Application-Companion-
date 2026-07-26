-- Rec Lab 2: tracks which CV embedding (by sourceHash) the recommended jobs
-- list was last sorted against, so the cosine-similarity sort only runs
-- once per CV upload instead of on every page load. See
-- apps/api/src/modules/rec-lab/rec-lab2.service.ts.
ALTER TABLE "cv_profiles" ADD COLUMN "recLab2SortHash" TEXT;
