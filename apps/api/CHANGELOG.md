# @dojofoo/api

## 0.0.3

### Patch Changes

- f685159: The events endpoint rejects an event whose `occurredAt` isn't a date and stores the time in ISO form; catalog reads leave out any stored event whose time isn't a date, so one bad event can no longer break the course list and the marketplace.
- 6458235: `add` reads the security checks of the exact version it downloaded, which the course API now runs first when it hasn't checked that version, asks before installing a version no check is for, checks with telemetry off too, and says so when the checks are unavailable.

## 0.0.2

### Patch Changes

- 9b85745: New courses start in trial: installable by their repository, left out of the catalog until they're enabled (`bun scripts/enable-course.ts owner/repository` in apps/api). Each registered version gets Dojo's security checks, and a scheduled workflow adds Cisco's skill-scanner; `add` reads them before installing – a failed check stops it, a warning asks first (`--yes` answers). Manifests can say `private: true` to stay unlisted (`marketplace: false` still works).
- 3d40648: Declare Elysia response object defaults before OpenAPI generation so the live Course API document remains identical to the Fumadocs snapshot after normal endpoint traffic.
