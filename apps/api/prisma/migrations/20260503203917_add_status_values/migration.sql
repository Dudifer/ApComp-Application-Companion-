-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApplicationStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'VIEWED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'ASSESSMENT';
ALTER TYPE "ApplicationStatus" ADD VALUE 'INTERVIEW';
