ALTER TABLE "Project"
  ADD COLUMN "assemblyProgress" JSONB,
  ADD COLUMN "assemblyRevision" INTEGER NOT NULL DEFAULT 0;
