# Account Center Design

## Status

Date: 2026-05-28

Status: design guidance for follow-up implementation tasks.

This document defines the target design for Mina's account center,
including the sidebar user menu, account navigation, profile settings,
password management, storage overview, billing placeholder, language
preferences, backend APIs, persistence, avatar storage, and verification
requirements.

It is a design document only. It should guide the next implementation
task; it is not an implementation record.

## 1. Goals

1. Replace the current sidebar user-row behavior with an account action
   card opened from the sidebar user area.
2. Add an account center under `/account/*`.
3. In account routes, keep the existing 295px app sidebar width but
   switch the sidebar content from product navigation to account
   navigation.
4. Provide a clear `Back to panel` action in account mode so users can
   return to the main workspace.
5. Add first-class frontend screens for profile, password, storage,
   billing, and settings.
6. Add backend contracts and authenticated APIs for profile updates,
   avatar upload, password change, language preference, storage overview,
   and billing overview.
7. Persist account settings safely and keep the implementation aligned
   with Mina's API layering, Tailwind-first frontend rules, i18n rules,
   and object-storage boundaries.

## 2. Non-Goals

1. Do not implement a full payment provider integration in this phase.
   Billing should expose a stable placeholder/overview contract that can
   be extended later.
2. Do not redesign the project/canvas page as part of this feature.
3. Do not move user avatars into the asset library. Avatars are account
   metadata, not user creative assets.
4. Do not add locale-prefixed routes.
5. Do not introduce a new frontend state management library.
6. Do not add large handwritten CSS files for the account center.

## 3. Current Baseline

Relevant current implementation facts:

1. `apps/web/src/app/app-shell.tsx` owns the global app shell, the
   295px sidebar grid, primary navigation, subscription panel, and user
   row.
2. The current user row shows initials, display name, and a direct logout
   icon button.
3. Primary app navigation currently only needs:
   - Projects
   - Asset Hub, disabled until implemented
4. `apps/web` uses TanStack Router file routes.
5. Auth state is stored by `AuthProvider` in local storage using the
   `AuthResponse` contract.
6. `AuthUser` currently includes `id`, `username`, `email`,
   `displayName`, `role`, `createdAt`, and `updatedAt`.
7. The API already has `accounts` routes for login/register and an
   `AccountsService` for session actor lookup.
8. The backend follows:

   ```text
   routes -> service -> repository
   ```

9. PostgreSQL user/account ownership is represented by `users` and
   `accounts`.
10. Object storage keys are account-scoped through the existing
    `ObjectStorage` abstraction.
11. The shared object storage root shape is:

    ```text
    users/{accountId}/...
    ```

12. Current i18n state is browser/local-storage based. Database-backed
    user locale preferences were previously a non-goal, but this feature
    explicitly changes that product decision.

## 4. Product UX

### 4.1 Sidebar User Action Card

Clicking the sidebar user area should open a compact action card above
the user row, visually aligned with the supplied reference.

The card must contain exactly four actions:

1. `Your account`
2. `Storage capacity`
3. `Top up and billing`
4. `Sign out`

Navigation behavior:

1. `Your account` navigates to `/account/profile`.
2. `Storage capacity` navigates to `/account/storage`.
3. `Top up and billing` navigates to `/account/billing`.
4. `Sign out` runs the existing logout flow.

Implementation guidance:

1. Use `@mina/ui/components/dropdown-menu` or
   `@mina/ui/components/popover`.
2. Prefer shadcn primitives from `@mina/ui/components/*`.
3. Keep menu text in locale catalogs.
4. The active, hover, and focus states should use existing theme tokens:
   `text-brand-accent`, `bg-gray-100`, `text-foreground`, and
   `text-foreground-secondary`.
5. Do not hardcode `#6911d4` in JSX. The product accent must be used
   through the `brand-accent` token.

### 4.2 Account Mode Sidebar

When the route matches `/account/*`, the app should keep the same shell
and the same 295px sidebar width, but the sidebar content should switch
to account mode.

The account sidebar should contain:

1. A top action: `Back to panel`
2. Account navigation:
   - `Profile`
   - `Password`
   - `Storage capacity`
   - `Top up and billing`
   - `Settings`

`Back to panel` behavior:

1. It is not an active navigation item.
2. It should use a back arrow icon from `lucide-react`.
3. It should return to the previous workspace route when available.
4. If there is no safe previous workspace route, it should fall back to
   `/projects`.
5. The route handoff should not reset auth state, React Query caches, or
   global locale state.

Recommended route mapping:

```text
/account/profile
/account/password
/account/storage
/account/billing
/account/settings
```

The default `/account` route should redirect to `/account/profile`.

### 4.3 Account Page Layout

The account center should feel like a focused settings area, not a
marketing page.

Layout guidance:

1. Keep the global app shell.
2. Put account content in the main workspace area.
3. Use a centered content column with restrained width, approximately
   `max-w-3xl` or similar Tailwind scale.
4. Use `text-sm` for most controls and navigation.
5. Use `text-xl` or `text-2xl` only for page-level titles.
6. Avoid nested cards. Use cards only for actual panels or repeated
   items.
7. Use flat surfaces, borders, rings, and named shadows. Do not add
   blur/filter/blend/mask effects.

## 5. Frontend Architecture

Create a feature module:

```text
apps/web/src/features/account/
  api/account.client.ts
  hooks/use-account-profile.ts
  hooks/use-account-preferences.ts
  components/account-page-shell.tsx
  components/profile-panel.tsx
  components/password-panel.tsx
  components/storage-panel.tsx
  components/billing-panel.tsx
  components/settings-panel.tsx
```

Recommended route files:

```text
apps/web/src/routes/account.tsx
apps/web/src/routes/account.index.tsx
apps/web/src/routes/account.profile.tsx
apps/web/src/routes/account.password.tsx
apps/web/src/routes/account.storage.tsx
apps/web/src/routes/account.billing.tsx
apps/web/src/routes/account.settings.tsx
```

Responsibilities:

1. Route files should stay thin and render feature components.
2. API transport belongs in `features/account/api`.
3. Server interactions belong in focused hooks.
4. Shell switching logic belongs in `src/app/app-shell.tsx` or a small
   app-shell helper, not inside account panels.
5. Account panels should not read raw local storage directly.

### 5.1 App Shell Account Mode

`AppShell` should derive account mode from the current path:

```text
pathname.startsWith('/account')
```

In normal mode, sidebar navigation remains:

1. Projects
2. Asset Hub, disabled

In account mode, sidebar navigation becomes the account nav described in
section 4.2.

The sidebar user area can remain visible in account mode if it does not
duplicate the account navigation in a confusing way. If it stays visible,
the same action card behavior should apply consistently.

### 5.2 Auth Session Updates

When profile or preferences are updated, the frontend should update the
stored auth user without requiring a logout/login cycle.

Recommended approach:

1. API update endpoints return the updated `AuthUser` or a compatible
   profile payload.
2. `AuthProvider` exposes an intentional helper to merge updated user
   fields into the current auth session.
3. The helper writes through to local storage using the existing
   auth-session storage path.

Avoid ad hoc local storage writes from feature components.

### 5.3 Frontend Styling

Follow the existing Tailwind-first rules:

1. Use Tailwind named scale for typography: `text-xs`, `text-sm`,
   `text-base`, `text-xl`, `text-2xl`.
2. Use Tailwind named spacing and sizing where possible.
3. Use exact rem geometry only for measured product dimensions that are
   not represented by the Tailwind scale, such as the 295px app sidebar
   expressed as `18.4375rem`.
4. Use `text-brand-accent` and `bg-brand-accent` for the product purple.
5. Use `bg-gray-100` for neutral hover/selected surfaces matching the
   reference.
6. Do not add new feature-level CSS dumps.
7. If account UI deletes or replaces existing components, remove unused
   CSS imports, stale class hooks, and unused translation keys in the
   same implementation change.

### 5.4 Frontend Internationalization

All visible account center text must use locale-bound messages from
`useMessages()`.

Required message groups:

1. Sidebar user menu labels.
2. Account navigation labels.
3. Profile form labels and actions.
4. Password form labels and validation messages.
5. Storage overview labels.
6. Billing overview labels.
7. Settings language labels.
8. Success and error messages.

Add keys to both:

```text
packages/i18n/messages/en.json
packages/i18n/messages/zh-Hans.json
```

Run `bun run i18n:compile` after catalog edits.

## 6. Backend Architecture

Add authenticated account-management routes under:

```text
/api/account
```

Do not mix these routes into `/api/auth`. `/api/auth` should remain
focused on login/register/session authentication entrypoints.

Recommended backend files:

```text
apps/api/src/modules/accounts/account-management.routes.ts
apps/api/src/modules/accounts/account-management.service.ts
apps/api/src/modules/accounts/account-management.repository.ts
apps/api/src/modules/accounts/account-management.drizzle-repository.ts
```

This keeps the feature close to the existing accounts module while
avoiding more responsibility drift in the login/register route file.

Layering rules:

1. Routes own HTTP concerns, auth actor lookup, request parsing, and
   response status codes.
2. Services own profile, password, preference, storage overview, and
   billing overview business logic.
3. Repositories own persistence details.
4. Storage adapters own object storage operations.
5. Contracts in `@mina/contracts` own request and response validation
   schemas.

## 7. API Contract

Add account-management schemas to:

```text
packages/contracts/src/modules/accounts/account.schemas.ts
```

or split them into a small account settings schema file if the accounts
contract becomes too large.

Recommended schemas:

```text
AccountProfileSchema
UpdateAccountProfileSchema
ChangePasswordSchema
UpdateAccountPreferencesSchema
AccountStorageOverviewSchema
AccountBillingOverviewSchema
AccountAvatarUploadResponseSchema
```

Recommended endpoints:

### 7.1 Current Account Profile

```http
GET /api/account/me
```

Response:

```json
{
  "user": {
    "id": "user_...",
    "username": "mina",
    "email": "user@example.com",
    "displayName": "Mina User",
    "avatarUrl": "https://...",
    "preferredLocale": "en",
    "role": "user",
    "createdAt": "2026-05-28T00:00:00.000Z",
    "updatedAt": "2026-05-28T00:00:00.000Z"
  }
}
```

`avatarUrl` should be a display URL, not the raw private storage key.

### 7.2 Update Profile

```http
PATCH /api/account/profile
```

Request:

```json
{
  "displayName": "Mina User"
}
```

Rules:

1. Trim display name.
2. Enforce min/max length through Zod.
3. Keep email immutable in this phase unless a separate verified email
   change flow is designed.
4. Return the updated user/profile payload.

### 7.3 Upload Avatar

```http
POST /api/account/avatar
```

Request:

```text
multipart/form-data
file=<image>
```

Rules:

1. Accept only `image/png`, `image/jpeg`, and `image/webp`.
2. Enforce a server-side size limit, recommended 2MB unless product
   chooses a larger explicit value.
3. Store the file through `ObjectStorage`.
4. Persist avatar metadata on `users`.
5. Delete the previous avatar object after the new avatar is safely
   persisted, when possible.
6. Return the updated profile payload or an avatar response containing a
   display URL.

### 7.4 Change Password

```http
PATCH /api/account/password
```

Request:

```json
{
  "currentPassword": "old password",
  "newPassword": "new password"
}
```

Rules:

1. Validate current password with the existing password verifier.
2. Hash the new password with the existing password hasher.
3. Increment `passwordVersion`.
4. Update `updatedAt`.
5. Keep the current session valid in this phase.
6. Future work may add "sign out other sessions" by comparing session
   password versions or explicitly revoking sessions.

### 7.5 Update Preferences

```http
PATCH /api/account/preferences
```

Request:

```json
{
  "preferredLocale": "en"
}
```

Rules:

1. Accept only supported Mina locales.
2. Persist the preference on the user.
3. Return the updated preference or updated user profile.
4. The web app should update `I18nProvider` state after success.

### 7.6 Storage Overview

```http
GET /api/account/storage
```

Response:

```json
{
  "usedBytes": 123456,
  "quotaBytes": 1073741824,
  "planName": "Free"
}
```

Rules:

1. Use `MediaObjectService.getAccountStorageUsage(accountId)` for the
   first implementation.
2. Keep the response shape explicit and future-proof.
3. Do not calculate storage usage on the frontend.

### 7.7 Billing Overview

```http
GET /api/account/billing
```

Response:

```json
{
  "planName": "Free",
  "billingStatus": "inactive",
  "creditBalance": 0,
  "currency": "USD"
}
```

Rules:

1. Keep this endpoint stable even if values are placeholders.
2. Do not introduce payment provider logic until the billing product
   design exists.
3. Use explicit enum-like values for status.

## 8. Database Design

Extend `users` with account settings metadata:

```text
avatar_storage_key text nullable
avatar_mime_type text nullable
avatar_updated_at timestamp with time zone nullable
preferred_locale text nullable
```

Existing `display_name` should continue to be used for the profile name.

Migration requirements:

1. Add nullable columns so existing users remain valid.
2. Do not backfill avatar fields.
3. Leave `preferred_locale` null for existing users so browser/local
   fallback still works.
4. Update Drizzle schema and generated migrations together.
5. Update repository row mappers and contracts so optional fields are
   represented consistently.

## 9. Avatar Storage Design

Avatar files should use the existing account-scoped object storage
abstraction.

Recommended storage key shape:

```text
users/{accountId}/uploads/avatars/{userId}/{avatarId}.{extension}
```

Rationale:

1. The `users/{accountId}` root enforces account isolation.
2. The existing `uploads` scope avoids expanding the storage scope enum
   solely for avatars.
3. The `avatars/{userId}` object name keeps avatar objects separate from
   task media and project assets.
4. Storing a versioned object instead of overwriting a fixed key avoids
   stale CDN/browser cache issues.

Display URL guidance:

1. Do not expose the private storage key to the web UI as a display URL.
2. Prefer a short-lived signed URL returned by the account API.
3. If stable avatar image URLs are required later, add a protected API
   redirect/stream endpoint rather than making all avatar objects public.

Cleanup guidance:

1. After a successful avatar replacement, delete the previous storage
   object if it exists and belongs to the same account root.
2. If deletion fails, log the failure but do not fail the completed
   profile update.

## 10. Language Preference Design

This feature intentionally upgrades language from browser-only state to
an authenticated user preference.

Rules:

1. `preferredLocale` is stored on the user record.
2. Login/register responses should include `preferredLocale` when
   available.
3. The settings screen updates both backend preference and current
   frontend locale state.
4. The request locale header should continue to be sent by the shared
   API client.
5. Do not add locale-prefixed routes.
6. Do not clear React Query caches, reset auth state, or rewrite routes
   solely because the language changed.

Resolution order after authentication:

1. Authenticated user `preferredLocale`, when present.
2. Stored browser locale.
3. Browser-detected locale.
4. Mina base locale.

The implementation should avoid route remount keys or full app resets.

## 11. Security And Privacy

1. All `/api/account/*` routes must require authentication.
2. User identity must come from the auth actor, not request body fields.
3. Profile updates must not allow role, id, email, account id, or
   storage key mutation by clients.
4. Password errors should use stable semantic error codes and localized
   display messages. Do not reveal whether the current password failed
   due to user existence or credential state beyond the authenticated
   user's own action.
5. Avatar uploads must validate file size and MIME type server-side.
6. Raw storage keys, presigned URLs, SQL text, and provider details must
   not appear in user-facing error params.
7. API errors must be thrown as `HttpError` with English
   `fallbackMessage`, stable `error.code`, and a catalog `messageKey`.
8. Do not trust frontend-only validation for account settings.

## 12. Performance And Reliability

1. Account pages should use React Query hooks for server state.
2. Profile and preferences updates should update local cache and auth
   session state after success.
3. Avatar upload should avoid loading large files into long-lived
   frontend state.
4. Storage overview should be fetched on demand and cached briefly.
5. The sidebar action card should not cause layout shifts in the shell.
6. Avoid high-cost visual effects in the account center.
7. Backend avatar cleanup should be best-effort after the main DB update
   succeeds.

## 13. Implementation Phases

### Phase 1: Contracts And Persistence

1. Add shared account-management schemas.
2. Add Drizzle columns and migrations.
3. Extend account repository mappings.
4. Add service methods for profile, password, preferences, storage, and
   billing overview.
5. Add account-management routes under `/api/account`.

### Phase 2: Account Sidebar And User Card

1. Replace direct logout icon behavior with the user action card.
2. Add account-mode sidebar switching.
3. Add `Back to panel` behavior with `/projects` fallback.
4. Add account routes and page shell.

### Phase 3: Account Screens

1. Implement profile screen.
2. Implement avatar upload.
3. Implement password screen.
4. Implement storage overview.
5. Implement billing overview placeholder.
6. Implement settings language selector.

### Phase 4: i18n, Polish, And Verification

1. Add all locale messages.
2. Compile Paraglide output.
3. Align visual states with the reference.
4. Run focused backend tests.
5. Run web and API typechecks.
6. Run full checks before release handoff.

## 14. Testing Requirements

Backend tests:

1. `GET /api/account/me` requires authentication and returns the current
   user's profile.
2. `PATCH /api/account/profile` validates and persists display name.
3. `POST /api/account/avatar` rejects missing files, unsupported MIME
   types, and oversized files.
4. `PATCH /api/account/password` rejects incorrect current password and
   updates password hash/version for valid input.
5. `PATCH /api/account/preferences` validates locale and persists it.
6. `GET /api/account/storage` returns explicit usage and quota shape.
7. `GET /api/account/billing` returns explicit placeholder overview.

Frontend verification:

1. User area opens the account action card.
2. `Your account` navigates to profile.
3. Storage and billing menu actions navigate directly to their account
   sections.
4. Account mode sidebar shows `Back to panel` and five account nav
   items.
5. `Back to panel` returns to the previous workspace route or `/projects`.
6. Profile update reflects in the sidebar user display without logout.
7. Language setting changes visible UI text without resetting app state.
8. Account screens fit desktop and mobile without text overflow.

Required commands:

```bash
bun run i18n:compile
bun run typecheck:web
bun run typecheck:api
bun --filter @mina/api test
```

Before release or deployment:

```bash
bun run check
```

## 15. Documentation Updates During Implementation

The implementation task should update:

1. `docs/development-standards.md` if a new durable rule is introduced.
2. `docs/project-onboarding-guide.md` if the account center changes
   onboarding-relevant architecture or locale behavior.
3. `docs/architecture.md` if package boundaries or backend layering
   materially change.
4. This document if product decisions change during implementation.

## 16. Open Decisions

The following decisions should be confirmed during implementation if the
product direction changes:

1. Whether account mode should hide the bottom subscription panel or keep
   it visible.
2. Whether avatar max upload size should be 2MB or a larger product
   value.
3. Whether password changes should invalidate all other sessions in the
   first release or a later security pass.
4. Whether billing should expose real credit consumption data in the
   first implementation or remain a placeholder overview.

Unless a later task changes these decisions, the recommended defaults are:

1. Keep the subscription panel visible if it does not conflict with the
   account nav layout.
2. Use a 2MB avatar upload limit.
3. Keep the current session valid and defer other-session invalidation.
4. Ship billing as a stable placeholder overview.
