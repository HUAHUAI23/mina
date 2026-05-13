DROP INDEX "tasks_account_idempotency_uidx";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "idempotency_key";