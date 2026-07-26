-- AlterTable
ALTER TABLE "cv_profiles" ADD COLUMN     "projects" JSONB NOT NULL DEFAULT '[]';
