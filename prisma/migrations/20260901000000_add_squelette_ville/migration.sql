-- Add squeletteVille column for Arabic consonantal skeleton matching
-- This enables robust matching of Moroccan city names despite spelling variants

ALTER TABLE "Office" ADD COLUMN IF NOT EXISTS "squeletteVille" TEXT;

-- Create standard index for exact skeleton matches
CREATE INDEX IF NOT EXISTS "Office_squelette_ville_idx" ON "Office"("squeletteVille");

-- Enable trigram extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram index for similarity-based fallback search
CREATE INDEX IF NOT EXISTS "Office_squelette_trgm_idx" ON "Office" USING gin ("squeletteVille" gin_trgm_ops);
