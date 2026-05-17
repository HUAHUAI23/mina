CREATE TABLE "workflow_edges" (
	"workflow_id" text NOT NULL,
	"edge_id" text NOT NULL,
	"type" text DEFAULT 'media' NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_id" text NOT NULL,
	"source_handle" text,
	"target_handle" text,
	"data" jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_edges_workflow_id_edge_id_pk" PRIMARY KEY("workflow_id","edge_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_nodes" (
	"workflow_id" text NOT NULL,
	"node_id" text NOT NULL,
	"type" text NOT NULL,
	"position_x" numeric(14, 3) NOT NULL,
	"position_y" numeric(14, 3) NOT NULL,
	"parent_id" text,
	"extent" text,
	"width" numeric(14, 3),
	"height" numeric(14, 3),
	"data" jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_nodes_workflow_id_node_id_pk" PRIMARY KEY("workflow_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_run_edges" (
	"workflow_run_id" text NOT NULL,
	"edge_id" text NOT NULL,
	"type" text DEFAULT 'media' NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_id" text NOT NULL,
	"source_handle" text,
	"target_handle" text,
	"data" jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_run_edges_workflow_run_id_edge_id_pk" PRIMARY KEY("workflow_run_id","edge_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_run_node_dependencies" (
	"workflow_run_id" text NOT NULL,
	"node_id" text NOT NULL,
	"depends_on_node_id" text NOT NULL,
	CONSTRAINT "workflow_run_node_dependencies_workflow_run_id_node_id_depends_on_node_id_pk" PRIMARY KEY("workflow_run_id","node_id","depends_on_node_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_run_node_states" (
	"workflow_run_id" text NOT NULL,
	"node_id" text NOT NULL,
	"status" text NOT NULL,
	"task_id" text,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_run_node_states_workflow_run_id_node_id_pk" PRIMARY KEY("workflow_run_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_run_nodes" (
	"workflow_run_id" text NOT NULL,
	"node_id" text NOT NULL,
	"type" text NOT NULL,
	"position_x" numeric(14, 3) NOT NULL,
	"position_y" numeric(14, 3) NOT NULL,
	"parent_id" text,
	"extent" text,
	"width" numeric(14, 3),
	"height" numeric(14, 3),
	"data" jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_run_nodes_workflow_run_id_node_id_pk" PRIMARY KEY("workflow_run_id","node_id")
);
--> statement-breakpoint
DROP INDEX "workflow_runs_status_updated_idx";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "next_reconcile_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "leased_by" text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "lease_token" text;--> statement-breakpoint
ALTER TABLE "workflow_edges" ADD CONSTRAINT "workflow_edges_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_edges" ADD CONSTRAINT "workflow_run_edges_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_node_dependencies" ADD CONSTRAINT "workflow_run_node_dependencies_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_node_states" ADD CONSTRAINT "workflow_run_node_states_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_node_states" ADD CONSTRAINT "workflow_run_node_states_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_nodes" ADD CONSTRAINT "workflow_run_nodes_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_edges_workflow_sort_idx" ON "workflow_edges" USING btree ("workflow_id","sort_order");--> statement-breakpoint
CREATE INDEX "workflow_edges_source_idx" ON "workflow_edges" USING btree ("workflow_id","source_node_id");--> statement-breakpoint
CREATE INDEX "workflow_edges_target_idx" ON "workflow_edges" USING btree ("workflow_id","target_node_id");--> statement-breakpoint
CREATE INDEX "workflow_nodes_workflow_sort_idx" ON "workflow_nodes" USING btree ("workflow_id","sort_order");--> statement-breakpoint
CREATE INDEX "workflow_nodes_workflow_parent_idx" ON "workflow_nodes" USING btree ("workflow_id","parent_id");--> statement-breakpoint
CREATE INDEX "workflow_nodes_workflow_type_idx" ON "workflow_nodes" USING btree ("workflow_id","type");--> statement-breakpoint
CREATE INDEX "workflow_run_edges_run_sort_idx" ON "workflow_run_edges" USING btree ("workflow_run_id","sort_order");--> statement-breakpoint
CREATE INDEX "workflow_run_edges_run_source_idx" ON "workflow_run_edges" USING btree ("workflow_run_id","source_node_id");--> statement-breakpoint
CREATE INDEX "workflow_run_edges_run_target_idx" ON "workflow_run_edges" USING btree ("workflow_run_id","target_node_id");--> statement-breakpoint
CREATE INDEX "workflow_run_node_dependencies_node_idx" ON "workflow_run_node_dependencies" USING btree ("workflow_run_id","node_id");--> statement-breakpoint
CREATE INDEX "workflow_run_node_dependencies_predecessor_idx" ON "workflow_run_node_dependencies" USING btree ("workflow_run_id","depends_on_node_id");--> statement-breakpoint
CREATE INDEX "workflow_run_node_states_run_status_idx" ON "workflow_run_node_states" USING btree ("workflow_run_id","status");--> statement-breakpoint
CREATE INDEX "workflow_run_node_states_task_idx" ON "workflow_run_node_states" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "workflow_run_nodes_run_sort_idx" ON "workflow_run_nodes" USING btree ("workflow_run_id","sort_order");--> statement-breakpoint
CREATE INDEX "workflow_run_nodes_run_parent_idx" ON "workflow_run_nodes" USING btree ("workflow_run_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_idempotency_key_uidx" ON "tasks" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "workflow_runs_claim_idx" ON "workflow_runs" USING btree ("status","next_reconcile_at","lease_until","updated_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_created_idx" ON "workflow_runs" USING btree ("workflow_id","created_at");--> statement-breakpoint
ALTER TABLE "workflow_runs" DROP COLUMN "snapshot_nodes";--> statement-breakpoint
ALTER TABLE "workflow_runs" DROP COLUMN "snapshot_edges";--> statement-breakpoint
ALTER TABLE "workflow_runs" DROP COLUMN "node_states";--> statement-breakpoint
ALTER TABLE "workflows" DROP COLUMN "nodes";--> statement-breakpoint
ALTER TABLE "workflows" DROP COLUMN "edges";
