CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"storage_root_prefix" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"role" text DEFAULT 'user' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "users" ("id", "email", "display_name", "role", "created_at", "updated_at")
VALUES ('user_demo', 'demo@mina.local', 'Demo User', 'admin', now(), now())
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "accounts" ("id", "owner_user_id", "name", "storage_root_prefix", "created_at", "updated_at")
SELECT source."account_id", 'user_demo', source."account_id", 'users/' || source."account_id", now(), now()
FROM (
	SELECT 'demo-account' AS "account_id"
	UNION
	SELECT "account_id" FROM "tasks"
	UNION
	SELECT "account_id" FROM "workflows"
	UNION
	SELECT "account_id" FROM "workflow_runs"
) source
WHERE source."account_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "task_resources" ADD COLUMN "account_id" text;--> statement-breakpoint
UPDATE "task_resources"
SET "account_id" = "tasks"."account_id"
FROM "tasks"
WHERE "task_resources"."task_id" = "tasks"."id";--> statement-breakpoint
ALTER TABLE "task_resources" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_owner_user_idx" ON "accounts" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_storage_root_uidx" ON "accounts" USING btree ("storage_root_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" USING btree ("email");--> statement-breakpoint
ALTER TABLE "task_resources" ADD CONSTRAINT "task_resources_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_resources_account_created_idx" ON "task_resources" USING btree ("account_id","created_at");
