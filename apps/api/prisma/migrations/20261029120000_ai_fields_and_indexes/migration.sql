-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "ai_draft" TEXT,
ADD COLUMN     "ai_draft_source" TEXT,
ADD COLUMN     "ai_rationale" TEXT;

-- CreateIndex
CREATE INDEX "tickets_author_id_idx" ON "tickets"("author_id");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

