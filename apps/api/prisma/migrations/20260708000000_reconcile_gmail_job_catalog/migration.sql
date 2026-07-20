-- CreateTable
CREATE TABLE "public"."gmail_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmail_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."job_catalog" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "country" TEXT,
    "city" TEXT,
    "state" TEXT,
    "locationDisplay" TEXT,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "workplaceType" TEXT,
    "employmentType" TEXT,
    "postedAt" TIMESTAMP(3),
    "applyUrl" TEXT,
    "department" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gmail_tokens_userId_key" ON "public"."gmail_tokens"("userId" ASC);

-- CreateIndex
CREATE INDEX "job_catalog_isRemote_idx" ON "public"."job_catalog"("isRemote" ASC);

-- CreateIndex
CREATE INDEX "job_catalog_postedAt_idx" ON "public"."job_catalog"("postedAt" DESC);

-- CreateIndex
CREATE INDEX "job_catalog_status_idx" ON "public"."job_catalog"("status" ASC);

-- AddForeignKey
ALTER TABLE "public"."gmail_tokens" ADD CONSTRAINT "gmail_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

