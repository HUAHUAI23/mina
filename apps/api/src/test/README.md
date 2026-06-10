# API Test Support

Test support code is split by responsibility so fixtures stay small and local to the behavior they support.

## Layout

- `doubles/<bounded-context>/`: in-memory implementations of repository, event-log, and storage ports. These classes should implement contracts only; they should not become object factories or scenario setup helpers.
- `builders/`: plain object builders for DTOs or domain records. Builders should return complete valid objects with small patch inputs for the fields a test cares about.
- `scenarios/`: cross-module setup helpers that wire services, doubles, and common environment pieces for route or service tests.
- `app.ts`: the full route-test application composition using the same service graph shape as production with test doubles at the infrastructure boundary.

## Rules

1. Add new fakes next to the module boundary they implement, for example `doubles/chat/fake-chat.repository.ts`.
2. Do not recreate a catch-all `fakes.ts`; import through `doubles/index.ts` only when a test needs several doubles.
3. Use builders for data shape noise, scenarios for orchestration noise, and doubles for behavior at an interface boundary.
4. Keep fake repositories deterministic enough to catch ordering, idempotency, ownership, and pagination bugs that production repositories must handle.
