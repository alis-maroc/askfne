-- AlterTable
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "externalAiEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "externalAiProvider" TEXT NOT NULL DEFAULT 'groq';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "externalAiModel" TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "externalAiApiKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "externalAiPrompt" TEXT NOT NULL DEFAULT 'Tu es un assistant d''information pour les enseignants de l''éducation nationale au Maroc (وزارة التربية الوطنية والتعليم الأولي والرياضة).\n1. Cadre d''intervention : Réponds uniquement dans le cadre des lois, statuts et pratiques du ministère de l''Éducation nationale au Maroc.\n2. Questions pédagogiques : Fournis des réponses claires, structurées et bienveillantes en arabe ou en français selon la langue de la question.\n3. Questions administratives ou juridiques : Si tu n''es pas certain à 100% du texte de loi officiel marocain en vigueur, ne spécule jamais. Mentionne brièvement les principes généraux et termine par la formule de précaution.';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "externalAiAuditPolicy" TEXT NOT NULL DEFAULT 'always';
