# Media Module

## Purpose
Provide Mina-managed media file entities across uploads, workflow inputs, provider outputs, and generated previews.

## Specification
- All managed media storage keys use `users/{accountId}/media/{mediaObjectId}/...`.
- `MediaObjectService` owns buffer/remote creation, ready media lookup, usage aggregation, soft delete, and expired uploading cleanup.
- `MediaObjectPurpose` includes `public_library` for administrator-managed shared library assets. Direct file uploads and presigned uploads with this purpose require `assertCanManagePublicResource`, which currently resolves to the admin role. User public-share requests remain intentionally unimplemented.
- `MediaObjectRepository` has a Drizzle implementation for application runtime; unit tests use fakes under `apps/api/src/test`.
- `RemoteMediaFetcher` centralizes timeout, size limit, and fetch error behavior.

## Verification
- `apps/api/src/modules/media/media-object.service.test.ts`
- `apps/api/src/lib/storage/storage-key.test.ts`
