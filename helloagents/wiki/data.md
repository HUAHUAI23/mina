# Data Model

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

## Workflow JSON
Workflow nodes store stable React Flow fields plus Mina node data. Executable node data may include `mediaSlots`, a slot-keyed ordered list of media slot items.
