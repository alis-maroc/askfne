-- AddTicketType migration
ALTER TABLE "Ticket" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'ticket';
CREATE INDEX "Ticket_type_idx" ON "Ticket"("type");