# ---- Builder stage ----
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
ENV JWT_SECRET="build_placeholder_secret"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
RUN cp node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs .next/server/chunks/pdf.worker.mjs

# ---- Runner stage ----
FROM node:22-slim AS runner

LABEL org.opencontainers.image.source="https://github.com/Hesper-Labs/owly"
LABEL org.opencontainers.image.description="AI-powered customer support agent"

# poppler-utils (PDF text + pdftoppm for OCR), tesseract-ocr (OCR engine for scanned PDFs),
# tesseract-ocr-ara (Arabic language data) + tesseract-ocr-fra (French — MEN docs are bilingual),
# fonts-kacst (KACST Arabic fonts for proper rendering), postgresql-client-16
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-ara \
    tesseract-ocr-fra \
    chromium \
    fonts-kacst \
    fonts-noto \
    curl \
    ca-certificates \
    gnupg \
    && install -d /etc/apt/keyrings \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-16 \
    && apt-get purge -y --auto-remove gnupg \
    && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
ENV WEB_CONCURRENCY=1

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/next.config.ts ./

RUN mkdir -p /app/.wwebjs_auth/baileys_auth

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3   CMD node -e "fetch('http://localhost:3000/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["sh", "-c", "mkdir -p /app/.wwebjs_auth/baileys_auth && npx prisma migrate deploy && npm start"]
