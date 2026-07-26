-- Gmail message id backing lastEmailSubject/lastEmailDate, so the UI can
-- deep-link to the actual email instead of just showing its subject line.
ALTER TABLE "applications" ADD COLUMN "lastEmailId" TEXT;
