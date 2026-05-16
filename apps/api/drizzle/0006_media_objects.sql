CREATE TABLE "media_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"checksum" text,
	"width" integer,
	"height" integer,
	"duration_seconds" numeric(12, 3),
	"origin" text NOT NULL,
	"purpose" text NOT NULL,
	"retention" text NOT NULL,
	"parent_media_object_id" text,
	"source_task_id" text,
	"source_task_resource_id" text,
	"metadata" jsonb,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_resources" ADD COLUMN "media_object_id" text;--> statement-breakpoint
ALTER TABLE "task_resources" ADD COLUMN "slot" text;--> statement-breakpoint
ALTER TABLE "task_resources" ADD COLUMN "slot_item_id" text;--> statement-breakpoint
ALTER TABLE "task_resources" ADD COLUMN "slot_order" integer;--> statement-breakpoint
ALTER TABLE "task_resources" ADD COLUMN "source" jsonb;--> statement-breakpoint
ALTER TABLE "media_objects" ADD CONSTRAINT "media_objects_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_objects" ADD CONSTRAINT "media_objects_source_task_id_tasks_id_fk" FOREIGN KEY ("source_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_resources_media_object_idx" ON "task_resources" USING btree ("media_object_id");--> statement-breakpoint
CREATE INDEX "media_objects_account_created_idx" ON "media_objects" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "media_objects_account_status_idx" ON "media_objects" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "media_objects_source_task_idx" ON "media_objects" USING btree ("source_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_objects_storage_key_uidx" ON "media_objects" USING btree ("storage_key");
