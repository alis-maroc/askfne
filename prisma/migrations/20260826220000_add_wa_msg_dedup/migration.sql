-- CreateTable
CREATE TABLE "wa_msg_dedup" (
    "key" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wa_msg_dedup_pkey" PRIMARY KEY ("key")
);
