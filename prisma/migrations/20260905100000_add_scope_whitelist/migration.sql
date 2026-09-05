-- AlterTable
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "scopeWhitelist" JSONB DEFAULT '[]'::jsonb;
