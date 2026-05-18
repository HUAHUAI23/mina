# Data Model

## Drizzle Workflow
Drizzle Kit uses `apps/api/src/db/schema.ts` as the source of truth. Database command entrypoints live under `apps/api/scripts/db`, while reusable schema and connection helpers live under `apps/api/src/db`. In active development, `db:push` syncs the current schema directly to PostgreSQL without writing migration files. `db:reset:push` drops Mina-owned tables and immediately re-syncs the schema. `db:create`, `db:drop`, and `db:migration:test` are available for recreating the configured development database and testing generated migrations. The Drizzle config filters introspection/push to Mina-owned tables in the `public` schema.

Application business persistence is PostgreSQL-only. Accounts, sessions, pricing rules, media objects, tasks, workflow definitions, workflow runs, node state, node task links, and lifecycle events are stored through Drizzle repositories.

## Auth

| Table | Purpose |
| --- | --- |
| `users` | User profile, username, email, role, soft deletion, timestamps |
| `user_password_credentials` | Local username/password credential hash and password policy metadata |
| `sessions` | First-party session id, user id, token hash, expiry, and revocation metadata |
| `oauth_accounts` | External provider account links and hashed provider token artifacts |
| `oauth_clients` | OAuth client metadata, redirect URIs, grant/response types, and scopes |
| `oauth_authorization_codes` | Hashed OAuth authorization codes with PKCE challenge fields |
| `oauth_refresh_tokens` | Hashed refresh tokens with parent-token linkage and revocation metadata |
| `oauth_consents` | User/client/scope consent state |

## `media_objects`
Managed media file entity table.

| Field | Purpose |
| --- | --- |
| `id` | Server-generated media object id |
| `account_id` | Tenant/account owner |
| `kind` | `image`, `video`, or `audio` |
| `status` | `uploading`, `ready`, `failed`, or `deleted` |
| `bucket`, `storage_key`, `url` | Object storage location |
| `byte_size`, `checksum`, `mime_type` | Storage accounting and content metadata |
| `origin`, `purpose`, `retention` | Lifecycle and business context |
| `parent_media_object_id` | Derived media relationship, such as video cover to source video |
| `source_task_id`, `source_task_resource_id` | Task output lineage |

Important indexes:
- `media_objects_account_created_idx`
- `media_objects_account_status_idx`
- `media_objects_source_task_idx`
- `media_objects_storage_key_uidx`

## `task_resources`
Task-scoped resource index. It now includes:

| Field | Purpose |
| --- | --- |
| `media_object_id` | Optional link to managed media object |
| `slot`, `slot_item_id`, `slot_order` | Workflow media slot coordinates |
| `source` | Discriminated lineage source |
| `metadata` | Provider or resolver-specific details |

## Workflow Storage
Workflow definitions are normalized for large canvas writes:

| Table | Purpose |
| --- | --- |
| `workflows` | Workflow-level metadata: account, name, version, deletion, timestamps |
| `workflow_nodes` | One persisted canvas node per row, including stable React Flow fields and node `data` |
| `workflow_edges` | One persisted canvas edge per row, including source/target handles and edge `data` |

Important indexes:
- `workflow_nodes_workflow_sort_idx`
- `workflow_nodes_workflow_parent_idx`
- `workflow_nodes_workflow_type_idx`
- `workflow_edges_source_idx`
- `workflow_edges_target_idx`

Workflow runs are normalized for concurrent schedulers:

| Table | Purpose |
| --- | --- |
| `workflow_runs` | Run metadata, status, selected node/scope, and scheduler lease fields |
| `workflow_run_nodes` | Immutable node snapshot for a run |
| `workflow_run_edges` | Immutable edge snapshot for a run |
| `workflow_run_node_states` | Row-level node execution state, task id, output, error, and timestamps |
| `workflow_run_node_dependencies` | Run-scoped executable-node dependency snapshot |
| `workflow_run_node_tasks` | Unique workflow-run/node to task link |

`workflow_runs` no longer stores `snapshot_nodes`, `snapshot_edges`, or `node_states` JSONB. Hot execution updates write individual `workflow_run_node_states` rows.

`tasks.idempotency_key` is optional and unique. Workflow-created node tasks use `workflow_run:{runId}:node:{nodeId}` to make retries and duplicate scheduler ticks return the same task.
