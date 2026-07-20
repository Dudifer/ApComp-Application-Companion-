-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('VIEWED', 'CLICKED', 'SAVED', 'APPLIED', 'MORE_LIKE_THIS', 'IGNORED', 'DISMISSED', 'LESS_LIKE_THIS');

-- CreateEnum
CREATE TYPE "InteractionContext" AS ENUM ('RECOMMENDED', 'SEARCH');

-- AlterTable
ALTER TABLE "cv_profiles" ADD COLUMN     "descriptionEmbedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
ADD COLUMN     "embeddingSourceHash" TEXT,
ADD COLUMN     "embeddingUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "skillsEmbedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
ADD COLUMN     "titleEmbedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[];

-- CreateTable
CREATE TABLE "job_embeddings" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "titleEmbedding" DOUBLE PRECISION[],
    "descriptionEmbedding" DOUBLE PRECISION[],
    "skillsEmbedding" DOUBLE PRECISION[],
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_interactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "jobCompany" TEXT,
    "type" "InteractionType" NOT NULL,
    "context" "InteractionContext" NOT NULL DEFAULT 'RECOMMENDED',
    "weight" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_embeddings_jobId_key" ON "job_embeddings"("jobId");

-- CreateIndex
CREATE INDEX "job_embeddings_source_externalId_idx" ON "job_embeddings"("source", "externalId");

-- CreateIndex
CREATE INDEX "job_interactions_userId_jobId_idx" ON "job_interactions"("userId", "jobId");

-- CreateIndex
CREATE INDEX "job_interactions_userId_createdAt_idx" ON "job_interactions"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "job_interactions" ADD CONSTRAINT "job_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
