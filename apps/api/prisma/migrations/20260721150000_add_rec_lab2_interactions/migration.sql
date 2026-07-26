-- Rec Lab 2's own interaction ledger — deliberately separate from
-- job_interactions/dismissed_jobs. See the model comment in schema.prisma
-- for why: those tables have real side effects on the live app and the
-- original Rec Lab's ranking that this table must not have (yet).
CREATE TABLE "rec_lab2_interactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "jobCompany" TEXT,
    "type" "InteractionType" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rec_lab2_interactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rec_lab2_interactions_userId_jobId_idx" ON "rec_lab2_interactions"("userId", "jobId");

CREATE INDEX "rec_lab2_interactions_userId_createdAt_idx" ON "rec_lab2_interactions"("userId", "createdAt");

ALTER TABLE "rec_lab2_interactions" ADD CONSTRAINT "rec_lab2_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
