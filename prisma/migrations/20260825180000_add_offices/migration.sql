CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT '',
    "province" TEXT NOT NULL DEFAULT '',
    "parentOffice" TEXT NOT NULL DEFAULT '',
    "secretary" TEXT NOT NULL DEFAULT '',
    "secretaryPhone" TEXT NOT NULL DEFAULT '',
    "treasurer" TEXT NOT NULL DEFAULT '',
    "treasurerPhone" TEXT NOT NULL DEFAULT '',
    "foundedAt" TEXT NOT NULL DEFAULT '',
    "renewalAt" TEXT NOT NULL DEFAULT '',
    "renewalDuration" TEXT NOT NULL DEFAULT '',
    "sourceUpdatedAt" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Office_sourceId_key" ON "Office"("sourceId");
CREATE INDEX "Office_level_idx" ON "Office"("level");
CREATE INDEX "Office_region_idx" ON "Office"("region");
CREATE INDEX "Office_province_idx" ON "Office"("province");
CREATE INDEX "Office_isActive_idx" ON "Office"("isActive");