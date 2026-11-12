-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "ai_draft_outcome" TEXT,
ADD COLUMN     "ai_draft_similarity" DOUBLE PRECISION,
ADD COLUMN     "ai_draft_sources" JSONB;
