-- DropIndex
DROP INDEX "job_embeddings_composite_vector_idx";

-- AlterTable
ALTER TABLE "job_embeddings" ALTER COLUMN "skillsEmbedding" SET DEFAULT ARRAY[]::DOUBLE PRECISION[];

-- AlterTable
ALTER TABLE "rec_lab2_interactions" ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "rec_lab2_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "startSnapshot" JSONB NOT NULL DEFAULT '[]',
    "avgTopFiveScoreChange" DOUBLE PRECISION,
    "firstPositivePosition" INTEGER,
    "mostInteractedPosition" INTEGER,

    CONSTRAINT "rec_lab2_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rec_lab2_sessions_userId_sessionNumber_idx" ON "rec_lab2_sessions"("userId", "sessionNumber");

-- CreateIndex
CREATE INDEX "rec_lab2_interactions_sessionId_idx" ON "rec_lab2_interactions"("sessionId");

-- AddForeignKey
ALTER TABLE "rec_lab2_sessions" ADD CONSTRAINT "rec_lab2_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
