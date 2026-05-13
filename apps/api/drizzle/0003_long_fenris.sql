ALTER TABLE "tasks" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE INDEX "tasks_queued_start_idx" ON "tasks" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_account_idempotency_uidx" ON "tasks" USING btree ("account_id","idempotency_key");