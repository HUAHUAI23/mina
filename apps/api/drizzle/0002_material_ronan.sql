ALTER TABLE "tasks" ADD COLUMN "provider_status" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "provider_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "last_polled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "pricing_rules"
SET "id" = 'price_image_dev_image',
    "billing_metric" = 'image',
    "updated_at" = now()
WHERE "id" = 'price_image_seedream_token';--> statement-breakpoint
UPDATE "pricing_rules"
SET "billing_metric" = 'image',
    "updated_at" = now()
WHERE "task_kind" = 'image_generation'
  AND "provider" = 'dev'
  AND "model" = 'dev-image'
  AND "billing_metric" = 'token';
