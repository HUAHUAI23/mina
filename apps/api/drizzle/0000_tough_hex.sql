CREATE TABLE "pricing_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"task_kind" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"resolution" text,
	"billing_metric" text NOT NULL,
	"unit_price" numeric(16, 6) NOT NULL,
	"currency" text NOT NULL,
	"active_from" timestamp with time zone NOT NULL,
	"active_to" timestamp with time zone,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"event_type" text NOT NULL,
	"message" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"direction" text NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"role" text,
	"output_index" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"kind" text NOT NULL,
	"mode" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"config" jsonb NOT NULL,
	"external_task_id" text,
	"estimated_cost" numeric(16, 6) NOT NULL,
	"actual_cost" numeric(16, 6),
	"usage_metric" text NOT NULL,
	"estimated_usage_amount" numeric(16, 6) NOT NULL,
	"actual_usage_amount" numeric(16, 6),
	"output" jsonb,
	"error_code" text,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_run_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_run_id" text NOT NULL,
	"node_id" text,
	"event_type" text NOT NULL,
	"message" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_run_node_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_run_id" text NOT NULL,
	"node_id" text NOT NULL,
	"task_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"account_id" text NOT NULL,
	"workflow_version" integer NOT NULL,
	"run_mode" text NOT NULL,
	"selected_node_id" text NOT NULL,
	"scope_group_node_id" text,
	"snapshot_nodes" jsonb NOT NULL,
	"snapshot_edges" jsonb NOT NULL,
	"node_states" jsonb NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"nodes" jsonb NOT NULL,
	"edges" jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_resources" ADD CONSTRAINT "task_resources_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_events" ADD CONSTRAINT "workflow_run_events_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_node_tasks" ADD CONSTRAINT "workflow_run_node_tasks_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_node_tasks" ADD CONSTRAINT "workflow_run_node_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pricing_rules_lookup_idx" ON "pricing_rules" USING btree ("task_kind","provider","model","resolution","billing_metric");--> statement-breakpoint
CREATE INDEX "task_events_task_idx" ON "task_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_resources_task_idx" ON "task_resources" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_status_retry_idx" ON "tasks" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "tasks_async_poll_idx" ON "tasks" USING btree ("status","mode","external_task_id");--> statement-breakpoint
CREATE INDEX "tasks_account_created_idx" ON "tasks" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_run_events_run_idx" ON "workflow_run_events" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_node_tasks_run_node_uidx" ON "workflow_run_node_tasks" USING btree ("workflow_run_id","node_id");--> statement-breakpoint
CREATE INDEX "workflow_run_node_tasks_task_idx" ON "workflow_run_node_tasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_status_updated_idx" ON "workflow_runs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_account_created_idx" ON "workflow_runs" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "workflows_account_updated_idx" ON "workflows" USING btree ("account_id","updated_at");