-- Enables real nearest-neighbor retrieval over job_embeddings (previously
-- "rank()" could only re-rank a candidate list handed to it — this is what
-- makes "embed CV -> pull the N nearest jobs across the full catalog" real).
--
-- Requires the pgvector extension files to be present in the Postgres image
-- itself — see docker-compose.yml (switch postgres:16 -> pgvector/pgvector:pg16)
-- and README notes. If the extension files aren't installed, the next line
-- fails with "could not open extension control file".
CREATE EXTENSION IF NOT EXISTS vector;

-- Composite embedding as a real `vector` type — average of titleEmbedding +
-- descriptionEmbedding (same math as scoring.ts's compositeEmbedding()),
-- stored separately from those Float[] columns because Postgres can only
-- build an ANN index over an actual `vector` column, not a plain array.
-- Nullable: existing rows are backfilled by scripts/backfill-composite-vector.ts,
-- not by this migration.
ALTER TABLE "job_embeddings" ADD COLUMN "compositeVector" vector(384);

-- HNSW, cosine distance (matches cosineSimilarity()/toPercent() used
-- elsewhere in scoring.ts, so "nearest by this index" and "highest percent
-- match by our own math" agree). Chose HNSW over ivfflat specifically
-- because HNSW builds incrementally and doesn't need pre-populated data to
-- train cluster centroids — safe to create this index right now, before the
-- backfill script has populated anything, unlike ivfflat which would build
-- a poor-quality index against an all-NULL column.
CREATE INDEX IF NOT EXISTS job_embeddings_composite_vector_idx
  ON "job_embeddings"
  USING hnsw ("compositeVector" vector_cosine_ops);
