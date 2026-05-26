# Mina Internationalization System Design

## Status

Date: 2026-05-26

This document is the implementation guidance for adding an internationalization system to Mina. The initial locale set is English and Simplified Chinese. The design covers the web application, API error messages, future server-rendered user-facing artifacts, contracts, persistence rules, testing, and rollout sequencing.

## Problem Statement

Mina currently has no internationalization layer. User-visible English strings are embedded directly in React components, route fallbacks, API error payloads, service errors, task lifecycle errors, workflow run errors, OpenAPI schemas, and tests. This is acceptable for early development, but it creates several problems:

1. Web UI text cannot be switched between English and Chinese without editing components.
2. API errors expose English `message` values as part of the response shape, which encourages clients to display or test unstable natural-language strings.
3. Backend task and workflow error messages are persisted as plain strings, making later localization impossible without losing the original semantic error.
4. Dates and numbers use ad hoc formatting such as `toLocaleString()` without a project-level locale policy.
5. Future server-side user-facing artifacts, such as emails, notifications, reports, or exports, have no locale selection or catalog strategy.

The target system must support both frontend and backend localization without weakening the existing Mina architecture rules.

## Goals

1. Support `en` and `zh-Hans` as the first locale set.
2. Keep all implementation compatible with Bun workspaces, Vite, React, TanStack Router, Hono, strict TypeScript, and existing package boundary rules.
3. Use a compile-time, type-safe message system instead of unchecked string-key lookups.
4. Keep API contracts code-first: clients must use stable error codes and typed fields, not natural-language messages, for behavior.
5. Allow the API to return localized fallback messages for user-facing clients.
6. Preserve English debug/fallback information for logs, traces, provider errors, and operational diagnosis.
7. Avoid storing localized strings in durable business state when storing a semantic code and params is possible.
8. Make generated files deterministic and compatible with `bun run typecheck`, `bun run build`, and `bun run check`.
9. Add conventions that prevent new hardcoded user-visible UI strings from spreading.
10. Keep web-only UI copy separate from backend/server artifact copy where that separation improves ownership.

## Non-Goals

1. Do not add SSR to the web app.
2. Do not localize user-authored data such as workflow names, prompts, node text, project names, file names, or uploaded media metadata.
3. Do not translate provider-owned model names or upstream provider raw error messages.
4. Do not introduce a remote translation SaaS dependency in the first implementation.
5. Do not support right-to-left layout in the first implementation.
6. Do not add locale-prefixed URLs in the first phase unless product requirements explicitly need shareable localized URLs.
7. Do not block API clients from ignoring localized messages and using only stable codes.

## Recommended Technology

Use Paraglide JS as the project internationalization engine.

Reasons:

1. Paraglide compiles messages into type-safe functions, which matches Mina's strict TypeScript posture.
2. The generated message functions are ordinary ESM and fit Vite, Bun, and package entrypoint boundaries.
3. The message-function model avoids React provider-only runtime coupling and works in both web and API code.
4. TanStack Router has official i18n guidance using Paraglide for client-side React apps, including URL rewriting when that becomes necessary.
5. Paraglide can run on standalone server frameworks, including Hono, through server-side APIs or middleware patterns.

Initial dependency target from current package lookup:

```json
"@inlang/paraglide-js": "2.18.1"
```

Add the dependency through the root workspace catalog and consume it with `catalog:` in packages that run generation or compile messages.

## Target Locale Policy

### Locale IDs

Use these locale identifiers:

```ts
export const minaBaseLocale = 'en'
export const minaLocales = ['en', 'zh-Hans'] as const
```

Rules:

1. Use `en`, not `en-US`, as the base locale unless product copy needs region-specific English.
2. Use `zh-Hans`, not `zh-CN`, for Simplified Chinese UI because the first requirement is language/script support rather than a country-specific variant.
3. If regional formatting must become country-specific later, add a separate formatter policy that maps `zh-Hans` to a default region such as `zh-CN` for `Intl` formatting.

### Display Names

Locale switcher labels:

```ts
const localeDisplayNames = {
  en: 'English',
  'zh-Hans': '简体中文',
} as const
```

The display names may be native-language labels because they are user-facing locale choices.

## Package Architecture

Add one shared package:

```text
packages/i18n
├── package.json
├── project.inlang
├── tsconfig.json
├── messages
│   ├── en.json
│   └── zh-Hans.json
└── src
    ├── api-errors.ts
    ├── format.ts
    ├── index.ts
    ├── locale.ts
    ├── paraglide
    │   └── ... generated files
    └── server.ts
```

Package responsibilities:

1. Own the shared locale list and base locale.
2. Own API error, validation, status, notification, export, and server artifact messages.
3. Export generated Paraglide message functions needed by both `apps/api` and `apps/web`.
4. Export locale parsing, negotiation, and formatting helpers that are framework-independent.
5. Export Hono-specific integration only from a dedicated entrypoint such as `@mina/i18n/server`.

Default implementation rule: put the first English and Simplified Chinese catalogs in `packages/i18n`. This keeps the initial migration simple, gives both apps one locale source, and avoids running two Paraglide compile pipelines before the project has translation ownership pressure.

Long-term ownership rule: split web-only UI copy into `apps/web` local catalogs only when the shared catalog becomes difficult to review or when frontend and backend translation ownership diverges. Until that split happens, `packages/i18n` may contain both shared API/server messages and web UI messages.

### Package Exports

`packages/i18n/package.json` should expose narrow entrypoints:

```json
{
  "name": "@mina/i18n",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./messages": {
      "types": "./src/paraglide/messages.d.ts",
      "default": "./src/paraglide/messages.js"
    },
    "./server": {
      "types": "./src/server.ts",
      "default": "./src/server.ts"
    }
  },
  "scripts": {
    "i18n:compile": "paraglide-js compile --project ./project.inlang --outdir ./src/paraglide --emit-ts-declarations --output-structure locale-modules",
    "build": "bun run i18n:compile && tsc -p tsconfig.json",
    "typecheck": "bun run i18n:compile && tsc --noEmit -p tsconfig.json"
  }
}
```

Use `locale-modules` for the first implementation. It produces fewer generated files and is easier to review in a medium-sized app. Revisit `message-modules` if bundle analysis later shows unused message cost is meaningful.

### Workspace Catalog

Add:

```json
"@inlang/paraglide-js": "2.18.1"
```

Then:

```json
"dependencies": {
  "@inlang/paraglide-js": "catalog:"
}
```

Use this dependency in `packages/i18n`. Keep `apps/web` dependent on `@mina/i18n` rather than `@inlang/paraglide-js` until a separate web-only catalog is intentionally introduced.

## Message Catalog Strategy

### Shared Catalog

Shared catalog content:

1. API errors.
2. Validation issue labels.
3. Task and workflow status display labels used by multiple surfaces.
4. Notification/email/report/export text.
5. Generic date/number labels if they are truly shared.

Example `messages/en.json`:

```json
{
  "$schema": "https://inlang.com/schema/inlang-message-format",
  "api_error_not_found": "Route not found.",
  "api_error_internal_server_error": "Unexpected server error.",
  "api_error_auth_invalid_credentials": "Invalid username or password.",
  "api_error_validation_failed": "The request is invalid.",
  "api_error_task_prompt_required": "Prompt is required.",
  "task_status_queued": "Queued",
  "task_status_running": "Running",
  "task_status_succeeded": "Succeeded",
  "task_status_failed": "Failed",
  "task_status_cancelled": "Cancelled"
}
```

Example `messages/zh-Hans.json`:

```json
{
  "$schema": "https://inlang.com/schema/inlang-message-format",
  "api_error_not_found": "未找到请求的路由。",
  "api_error_internal_server_error": "服务器发生意外错误。",
  "api_error_auth_invalid_credentials": "用户名或密码错误。",
  "api_error_validation_failed": "请求参数无效。",
  "api_error_task_prompt_required": "请填写提示词。",
  "task_status_queued": "排队中",
  "task_status_running": "运行中",
  "task_status_succeeded": "已成功",
  "task_status_failed": "已失败",
  "task_status_cancelled": "已取消"
}
```

### Optional Web Catalog Split

Do not start with a separate web catalog. If the web app later keeps web-only messages separate, use this structure:

```text
apps/web/project.inlang
apps/web/messages/en.json
apps/web/messages/zh-Hans.json
apps/web/src/paraglide
```

After that split, `apps/web` should use local generated messages for web-only copy:

```ts
import { m } from '../../paraglide/messages.js'
```

For shared messages before and after the split:

```ts
import { m as sharedMessages } from '@mina/i18n/messages'
```

Avoid importing `@mina/i18n/src/*` internals. Use package entrypoints only.

### Message Naming

Use explicit, stable message names:

```text
api_error_auth_invalid_credentials
api_error_validation_failed
auth_login_title
auth_login_submit
app_nav_projects
canvas_create_new
workflow_run_failed
task_status_running
model_field_aspect_ratio
```

Rules:

1. Prefix by domain or surface.
2. Prefer semantic names over English text-derived names.
3. Do not reuse one message for two different UX contexts just because the English text is currently identical.
4. Use params for variable content instead of string concatenation.
5. Keep punctuation inside the translation.

Example:

```json
{
  "canvas_updated_at": "Updated {updatedAt}",
  "workflow_output_selected": "Selected output {index}"
}
```

## Locale Resolution

### Web Runtime

Initial web locale priority:

```text
localStorage explicit user choice
-> navigator.languages
-> base locale
```

Implementation notes:

1. Store the explicit user choice in `localStorage` under `mina.locale`.
2. Keep auth session storage separate from locale storage.
3. Add a locale selector to the app shell and auth gate.
4. Set `<html lang>` whenever the locale changes.
5. Keep route paths unchanged in phase 1.

Do not use URL locale prefixes in phase 1. Current routes and route checks include raw path assumptions, such as canvas detail shell handling. URL i18n should be introduced only after route rewrite tests are in place.

### API Runtime

API locale priority:

```text
explicit X-Mina-Locale header
-> authenticated user preference, when available
-> mina_locale cookie, when available
-> Accept-Language
-> base locale
```

Use `X-Mina-Locale` for programmatic clients and background operations that need deterministic output. Use cookies only as a browser convenience.

Implementation shape:

```ts
export const resolveLocale = (input: {
  acceptLanguage?: string
  cookieLocale?: string
  headerLocale?: string
  userLocale?: string
}): MinaLocale => {
  // normalize, validate, and match to supported locales
}
```

Hono middleware:

```ts
app.use('/api/*', async (c, next) => {
  const locale = resolveLocale({
    acceptLanguage: c.req.header('Accept-Language'),
    cookieLocale: readCookie(c, 'mina_locale'),
    headerLocale: c.req.header('X-Mina-Locale'),
  })

  c.set('locale', locale)
  await next()
})
```

Add a typed Hono variable definition in API app code:

```ts
type ApiVariables = {
  locale: MinaLocale
}
```

If the app already has Hono generic types elsewhere, extend that existing type rather than creating parallel app types.

### User Preference

Do not add database persistence for user locale in the first task unless product wants account-level preference immediately. If added later:

1. Add `users.locale` or `user_preferences.locale`.
2. Validate against `@mina/i18n` locale schemas.
3. Do not use it until after auth middleware loads the session user.
4. Allow explicit request header to override it for exports, automation, or support tooling.

## API Error Contract

### Target Shape

Update `ApiErrorSchema` from:

```ts
{
  error: {
    code: string
    message: string
  }
}
```

to:

```ts
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    locale: SupportedLocaleSchema.optional(),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    issues: z.array(ApiValidationIssueSchema).optional(),
  }),
})
```

Compatibility rule:

1. Keep `message` required during migration so current clients and tests keep working.
2. Add `locale`, `params`, and `issues` as optional.
3. Use `code` as the only stable behavior key.

### Error Codes

Create a shared contract for known error codes:

```ts
export const ApiErrorCodeSchema = z.enum([
  'NOT_FOUND',
  'INTERNAL_SERVER_ERROR',
  'UNAUTHORIZED',
  'ADMIN_REQUIRED',
  'AUTH_INVALID_CREDENTIALS',
  'VALIDATION_FAILED',
  'TASK_CONFIG_INVALID',
  'TASK_PROMPT_REQUIRED',
  'WORKFLOW_NOT_FOUND',
  'WORKFLOW_VERSION_CONFLICT',
])
```

Start with codes already used in the codebase, then expand as service errors are migrated. Avoid making the schema exhaustive until all current code paths have been audited; a strict enum too early can block provider-specific and integration-specific errors. A staged approach is:

1. Add `KnownApiErrorCodeSchema`.
2. Keep `ApiErrorSchema.error.code` as `z.string().min(1)`.
3. Add helper types for known codes.
4. Convert to stricter enums only after unknown codes are eliminated or intentionally modeled.

### HttpError Class

Current `HttpError` stores only status, code, and message. Replace it with a localizable shape:

```ts
type LocalizedMessageCode =
  | 'api_error_not_found'
  | 'api_error_internal_server_error'
  | 'api_error_auth_invalid_credentials'
  | 'api_error_validation_failed'
  | 'api_error_task_prompt_required'

type HttpErrorParams = Record<string, string | number | boolean>

export class HttpError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    options: {
      fallbackMessage: string
      messageKey?: LocalizedMessageCode
      params?: HttpErrorParams
      issues?: ApiValidationIssue[]
    },
  ) {
    super(options.fallbackMessage)
    this.name = 'HttpError'
    this.messageKey = options.messageKey
    this.params = options.params
    this.issues = options.issues
  }
}
```

Rules:

1. `Error.message` remains an English fallback/debug value.
2. `messageKey` points to the translation catalog.
3. `params` must contain only safe, non-secret primitive values.
4. Do not pass raw provider responses, stack traces, tokens, URLs with credentials, or SQL text through params.

### Error Payload Builder

Replace `createErrorPayload(code, message)` with:

```ts
export const createErrorPayload = (input: {
  code: string
  fallbackMessage: string
  locale: MinaLocale
  messageKey?: LocalizedMessageCode
  params?: HttpErrorParams
  issues?: ApiValidationIssue[]
}): ApiError => {
  const message = input.messageKey
    ? translateApiMessage(input.messageKey, input.locale, input.params)
    : input.fallbackMessage

  return {
    error: {
      code: input.code,
      message,
      locale: input.locale,
      ...(input.params ? { params: input.params } : {}),
      ...(input.issues ? { issues: input.issues } : {}),
    },
  }
}
```

The implementation must avoid dynamic message lookup that loses type safety. Use a typed mapping:

```ts
const apiErrorMessageByCode = {
  NOT_FOUND: m.api_error_not_found,
  INTERNAL_SERVER_ERROR: m.api_error_internal_server_error,
  AUTH_INVALID_CREDENTIALS: m.api_error_auth_invalid_credentials,
} satisfies Record<string, MessageFunction>
```

Exact types may differ depending on the generated Paraglide output.

## Validation Errors

Use structured validation issues instead of exposing Zod text.

### Target Issue Shape

```ts
export const ApiValidationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  code: z.string().min(1),
  message: z.string().min(1).optional(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
})
```

Rules:

1. `code` is semantic, such as `REQUIRED`, `INVALID_EMAIL`, `TOO_SMALL`, `TOO_BIG`, `INVALID_ENUM`.
2. `path` is the payload path, not a translated field label.
3. `message` may be localized by the server for convenience, but clients should use `code + path`.
4. Do not return the full Zod issue object because it may expose implementation details and is not a stable API contract.

### Standard Validator Integration

The API currently uses `@hono/standard-validator`. Add a wrapper around validator failures that converts schema failures to `HttpError` with:

```text
code: VALIDATION_FAILED
messageKey: api_error_validation_failed
issues: [...]
```

Do this at the route boundary. Routes own HTTP concerns, so this belongs near validators or route helpers, not in services.

## Backend Persistence Rules

### Durable Domain Errors

Do not persist localized messages in domain tables. Persist semantic errors.

Current task storage has:

```text
tasks.error_code
tasks.error_message
```

Target direction:

```text
tasks.error_code
tasks.error_message_key
tasks.error_params
tasks.error_debug_message
```

If a database migration is too large for the first implementation, use an intermediate mapping:

1. Continue writing `error_code`.
2. Keep `error_message` as English fallback/debug text.
3. Add service-level response mapping that translates known task error codes for API output.
4. Add a later migration for `error_message_key`, `error_params`, and `error_debug_message`.

For workflow runs and node states, avoid expanding the plain `error` field further. Add a design follow-up to normalize workflow errors if the workflow storage refactor has not already done so.

### Provider Errors

Provider errors require special treatment:

1. Store provider raw text as `debugMessage` or event log text, not as a localized user message.
2. Map known provider failure categories to Mina codes, such as `PROVIDER_RATE_LIMITED`, `PROVIDER_AUTH_FAILED`, `PROVIDER_CONTENT_REJECTED`, `PROVIDER_TIMEOUT`, and `PROVIDER_UNAVAILABLE`.
3. Use a generic localized user message for unknown provider failures.
4. Log raw provider details through Pino with appropriate redaction.

Example:

```json
{
  "code": "PROVIDER_TIMEOUT",
  "messageKey": "api_error_provider_timeout",
  "params": { "provider": "google" },
  "debugMessage": "Google API request failed: 504"
}
```

### Lifecycle Events

Task and workflow event tables may keep English debug messages for operator history. If events are displayed directly to end users, responses should expose:

```json
{
  "eventType": "task_failed",
  "message": "任务失败。",
  "debugMessage": "Provider API unavailable.",
  "locale": "zh-Hans"
}
```

Do not overwrite stored historical event messages when the user switches locale.

## Server-Generated User Artifacts

Backend i18n is required for artifacts generated by the server and consumed directly by users:

1. Emails.
2. In-app notifications generated by background jobs.
3. PDF reports.
4. CSV exports with localized headers.
5. Long-running task completion summaries.
6. Webhook payloads only if the target consumer expects localized human text.

For async artifacts, snapshot the locale at creation time:

```ts
interface LocalizedJobInput {
  locale: MinaLocale
  requestedByUserId: string
}
```

Do not resolve the locale at send time if the artifact was requested earlier. This prevents user preference changes from mutating queued output semantics.

## Web Integration

### Provider Placement

Add locale initialization in `AppProviders` or a focused `I18nProvider`.

Current provider chain:

```text
QueryClientProvider
-> AuthProvider
-> ClientModelRegistryProvider
-> TooltipProvider
```

Target:

```text
QueryClientProvider
-> I18nProvider
-> AuthProvider
-> ClientModelRegistryProvider
-> TooltipProvider
```

Place `I18nProvider` outside `AuthProvider` so the auth gate can be localized before authentication.

### Locale Switcher

Add a compact locale control in:

1. Auth gate, because unauthenticated users need language selection.
2. App shell user controls, because authenticated users need to switch language after login.

The control should use project UI rules:

1. Use a menu/select-like control, not free text.
2. Keep labels short: `English`, `简体中文`.
3. Update `localStorage`, Paraglide locale state, and `<html lang>`.
4. Do not recreate route content or clear React Query cache solely because locale changes.

### Client API Locale Header

The web API client should send `X-Mina-Locale`.

Update `apps/web/src/lib/api-client.ts` or the shared HTTP utility so every API request includes:

```ts
'X-Mina-Locale': getLocale()
```

Rules:

1. Keep `Authorization` handling unchanged.
2. Do not expose secrets in locale headers.
3. Validate locale before sending.

### Text Migration Order

Migrate web text by stable surfaces:

1. Auth gate and auth errors.
2. App shell navigation and profile labels.
3. Plaza page.
4. Projects page.
5. Canvas list page.
6. Workflow canvas loading/errors/controls.
7. Model form field labels and option labels.
8. Tests and snapshots that assert visible text.

Do not migrate all strings with a mechanical regex pass without reading context. Some strings are data IDs, CSS classes, route paths, ARIA technical IDs, provider model IDs, or internal error messages.

### Date and Number Formatting

Create `@mina/i18n` helpers:

```ts
export const formatDateTime = (date: Date | string, locale: MinaLocale): string =>
  new Intl.DateTimeFormat(localeToIntlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(typeof date === 'string' ? new Date(date) : date)
```

Replace direct user-visible `new Date(value).toLocaleString()` with project helpers.

Keep storage and API timestamps in ISO strings.

## API Integration

### Create App

`apps/api/src/app/create-app.ts` should change from hardcoded English:

```ts
app.notFound((c) => c.json(createErrorPayload('NOT_FOUND', 'Route not found.'), 404))
```

to locale-aware payload generation:

```ts
app.notFound((c) =>
  c.json(
    createErrorPayload({
      code: 'NOT_FOUND',
      fallbackMessage: 'Route not found.',
      locale: getRequestLocale(c),
      messageKey: 'api_error_not_found',
    }),
    404,
  ),
)
```

`onError` should follow the same pattern. Unknown errors should log raw error details and return localized `INTERNAL_SERVER_ERROR` only.

### Services

Service layer errors should throw semantic `HttpError` values with fallback English and message keys. Example:

```ts
throw new HttpError(401, 'AUTH_INVALID_CREDENTIALS', {
  fallbackMessage: 'Invalid username or password.',
  messageKey: 'api_error_auth_invalid_credentials',
})
```

Routes should not translate service errors. The root `onError` handler should translate consistently.

### Routes

Routes should only pass locale explicitly when the operation creates a future server artifact, such as an export or notification job. Ordinary request errors should use request-local middleware.

## Contracts and OpenAPI

Update:

1. `packages/contracts/src/schemas/api-error.schemas.ts`
2. Any response schemas that expose error objects or persisted task/workflow errors.
3. `apps/api/src/app/openapi.ts`
4. Route tests that inspect error payloads.

OpenAPI should document:

1. `X-Mina-Locale` request header.
2. `error.locale`.
3. `error.params`.
4. `error.issues`.
5. The rule that `error.code` is stable and `error.message` is localized/user-facing.

Example OpenAPI description:

```text
Localized human-readable fallback. Clients must use error.code and structured fields for behavior.
```

## Testing Strategy

### Unit Tests

Add tests for:

1. Locale normalization and fallback.
2. `Accept-Language` matching.
3. Header precedence over browser/header fallback.
4. Translation mapping for known API errors.
5. Validation issue conversion.
6. `Intl` formatter helpers.

### API Route Tests

Add request-level tests:

1. `GET /missing` with no locale returns English `NOT_FOUND`.
2. `GET /missing` with `X-Mina-Locale: zh-Hans` returns Chinese `message` and `locale: "zh-Hans"`.
3. Invalid locale header falls back to English.
4. Auth failure returns the same `code` in both languages and localized `message`.
5. Validation failure returns stable `issues`.

### Web Tests

Add focused web tests:

1. Auth gate renders English by default.
2. Locale switch changes visible auth copy to Chinese.
3. Locale switch persists after reload.
4. API client sends `X-Mina-Locale`.
5. Date formatting changes when locale changes.

Update existing Playwright selectors carefully. Prefer accessible roles with stable labels only where translated labels are explicitly under test. For language-independent tests, use test IDs only when accessible text would make the test brittle across locales.

### Static Checks

Add a lightweight script later:

```text
scripts/check-i18n-strings.ts
```

Purpose:

1. Scan `apps/web/src` for hardcoded user-visible strings in JSX.
2. Allow known exceptions: brand names, CSS class names, route paths, model IDs, test-only strings, provider names, ARIA IDs.
3. Fail only after the first migration pass is complete.

Do not add this check before baseline migration, or it will create too much noise.

## Migration Plan

### Phase 1: Shared I18n Infrastructure

Tasks:

1. Add `@inlang/paraglide-js` to the workspace catalog.
2. Create `packages/i18n`.
3. Add `project.inlang`, `messages/en.json`, and `messages/zh-Hans.json`.
4. Add compile/typecheck/build scripts.
5. Export locale helpers, generated messages, and formatting helpers.
6. Add `@mina/i18n` to `apps/api` and `apps/web` dependencies.
7. Run `bun --filter @mina/i18n typecheck`.

Acceptance:

1. Generated files are present or deterministically generated before typecheck.
2. `bun run typecheck` can resolve `@mina/i18n`.
3. No app behavior changes yet except package availability.

### Phase 2: API Locale and Error Contract

Tasks:

1. Update `ApiErrorSchema`.
2. Add known API error code helpers.
3. Add locale middleware to API app.
4. Refactor `HttpError` and `createErrorPayload`.
5. Localize `notFound` and `onError`.
6. Convert account/auth errors first.
7. Add API tests for English and Chinese errors.
8. Update OpenAPI error schema and header documentation.

Acceptance:

1. Error `code` remains stable.
2. English responses are backward-compatible for `message`.
3. Chinese responses are available with `X-Mina-Locale: zh-Hans`.
4. Unknown server errors do not leak raw internal messages.

### Phase 3: Validation and Service Error Normalization

Tasks:

1. Add validation issue schema.
2. Wrap validator failures.
3. Convert task config validation errors.
4. Convert workflow HTTP errors.
5. Define provider error category codes.
6. Add tests for validation and task config errors.

Acceptance:

1. Zod raw messages are not the primary user-facing API contract.
2. Known validation errors include `issues`.
3. Provider raw errors are logged/debugged, not blindly localized or exposed.

### Phase 4: Web I18n Runtime

Tasks:

1. Add web `I18nProvider`.
2. Add locale storage and `html lang` update.
3. Add auth gate locale switcher.
4. Add app shell locale switcher.
5. Add `X-Mina-Locale` to API client requests.
6. Add formatter helpers to visible date/time surfaces.

Acceptance:

1. The user can switch between English and Chinese before and after login.
2. Locale persists across reload.
3. API requests include the selected locale.
4. Existing app shell layout does not shift or overflow in Chinese.

### Phase 5: Web Copy Migration

Tasks:

1. Migrate auth gate.
2. Migrate app shell.
3. Migrate Plaza, Projects, and Canvas list.
4. Migrate workflow canvas controls and status messages.
5. Migrate model form labels and option labels.
6. Update tests for localized UI.

Acceptance:

1. No major user-facing English-only copy remains in the target surfaces.
2. Brand names and user data remain unchanged.
3. Existing route generation, typecheck, and build pass.
4. Mobile and desktop layouts remain usable in both locales.

### Phase 6: Backend Durable Error Follow-Up

Tasks:

1. Audit persisted task and workflow error fields.
2. Introduce semantic error storage fields where needed.
3. Map old plain messages to fallback debug messages.
4. Add response-time localization for task/workflow error displays.
5. Add migration tests if schema changes are made.

Acceptance:

1. New durable task/workflow errors store code/key/params/debug data where possible.
2. API output can localize known durable errors at response time.
3. Existing scheduler and retry behavior remains unchanged.

### Phase 7: Optional URL Locale Routing

Only start this phase if product needs localized share links or SEO.

Tasks:

1. Add TanStack Router `rewrite` integration.
2. Add Paraglide URL strategy.
3. Update root route shell logic for locale-prefixed paths.
4. Add route tests for `/zh-Hans`, `/zh-Hans/projects`, and `/zh-Hans/canvas/:workflowId`.

Acceptance:

1. Existing non-prefixed URLs still work or redirect consistently.
2. Canvas detail routes still bypass the app shell exactly as intended.
3. Route generation and type checking remain stable.

## Code Ownership Rules

1. `packages/i18n` owns locale definitions, shared/server messages, and the initial web UI catalog.
2. `apps/web` owns web-only UI messages only after an explicit catalog split is introduced.
3. `packages/contracts` owns API error and validation issue shapes.
4. `apps/api/src/lib/http` owns HTTP error payload construction.
5. `apps/api/src/app` owns request locale middleware and root error handling.
6. Feature services own semantic error code selection but not translation.
7. Repositories do not translate messages.
8. Provider adapters classify provider errors but do not localize them.

## Security and Privacy

1. Never put secrets, tokens, presigned URLs, SQL text, raw provider payloads, or stack traces into translation params.
2. Treat localized `message` as user-facing and safe to expose.
3. Keep raw provider and internal errors in logs or debug fields only when appropriate.
4. Avoid locale in cache keys unless the cached value contains localized text.
5. Validate `X-Mina-Locale` against supported locales; do not reflect arbitrary header values.
6. Do not rely on locale for authorization, tenant selection, billing, or business permissions.

## Performance Considerations

1. Compile messages before typecheck/build so generated modules are available to TypeScript.
2. Avoid loading web-only catalogs into API runtime.
3. Prefer typed direct message function imports over dynamic catalog traversal.
4. Use `Intl.DateTimeFormat` helpers, and cache formatters if repeated formatting becomes hot.
5. Do not invalidate React Query data solely because locale changed unless the data contains localized server text.
6. Avoid storing duplicate localized copies of task/workflow state.

## Documentation Updates Required During Implementation

Update these docs as implementation lands:

1. `docs/architecture.md`: add `packages/i18n`, locale middleware, and API error contract rules.
2. `docs/setup-and-operations.md`: add i18n compile command and locale behavior notes.
3. `docs/development-standards.md`: add i18n rules for user-visible strings, API errors, and durable error storage.
4. `docs/audit-report-2026-03.md`: update only if the i18n migration materially changes the engineering baseline.

Recommended new development standards:

1. User-visible web text must use generated message functions.
2. API errors must expose stable codes; localized messages are display fallbacks.
3. Services throw semantic errors with English fallback text and optional message keys.
4. Persist error codes and params instead of localized strings.
5. Use shared locale and formatter helpers instead of raw `toLocaleString()` for visible dates.

## Implementation Checklist

1. Add `@mina/i18n` package and compile scripts.
2. Add shared English and Simplified Chinese catalogs.
3. Export locale schemas, locale helpers, and formatter helpers.
4. Add API locale middleware.
5. Update API error contract and OpenAPI schema.
6. Refactor `HttpError` and root error handling.
7. Localize not found, internal errors, auth errors, and validation errors.
8. Add web locale provider and switchers.
9. Send selected locale from web API client.
10. Migrate auth gate and app shell copy.
11. Migrate primary route copy.
12. Migrate workflow canvas copy.
13. Normalize durable task/workflow errors.
14. Add API and web tests for both locales.
15. Update architecture, operations, and standards docs.
16. Run `bun run check`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Generated Paraglide files are missing before TypeScript runs | `typecheck` fails | Run `i18n:compile` inside package `typecheck`, `build`, and app scripts that depend on messages. |
| API clients start branching on localized messages | Fragile behavior across locales | Document and test that `error.code` is stable; keep `message` user-facing only. |
| Raw provider errors leak to users | Security and UX risk | Classify provider errors; localize known categories; log raw details separately. |
| Web layout breaks with Chinese text | UI regression | Test auth, shell, cards, and canvas controls in both locales at mobile and desktop sizes. |
| Catalog ownership becomes unclear | Duplicate or stale translations | Start with one `@mina/i18n` catalog; split web-only messages later only with a documented ownership reason. |
| Locale-prefixed routes break shell assumptions | Navigation regression | Defer URL routing to a later phase with explicit route rewrite tests. |

## Open Questions

1. Should Mina persist user locale preferences in the database during the first implementation, or keep the first phase browser-local only?
2. What threshold should trigger splitting web-only UI messages from `packages/i18n` into `apps/web`?
3. Should API response `message` always be localized when a supported locale is supplied, or should some machine-to-machine endpoints return English fallback only?
4. Which future server artifacts are planned first: email, in-app notification, export, or report?

Default recommendation:

1. Start with browser-local preference and `X-Mina-Locale`.
2. Begin with one shared `@mina/i18n` catalog for speed and split later when ownership pressure appears.
3. Localize public API errors, but keep debug/provider text English and internal.
4. Defer URL locale routing and user preference persistence until product requirements need them.
