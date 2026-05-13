DROP INDEX "pricing_rules_lookup_idx";--> statement-breakpoint
ALTER TABLE "pricing_rules" RENAME COLUMN "resolution" TO "pricing_key";--> statement-breakpoint
UPDATE "pricing_rules"
SET "pricing_key" = 'resolution:' || "pricing_key",
    "updated_at" = now()
WHERE "pricing_key" IS NOT NULL
  AND "pricing_key" NOT LIKE '%:%';--> statement-breakpoint
CREATE INDEX "pricing_rules_lookup_idx" ON "pricing_rules" USING btree ("task_kind","provider","model","pricing_key","billing_metric");
