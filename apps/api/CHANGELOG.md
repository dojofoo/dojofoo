# @dojofoo/api

## 0.0.2

### Patch Changes

- 9b85745: New courses start in trial: installable by their repository, left out of the catalog until they're enabled (`bun scripts/enable-course.ts owner/repository` in apps/api). Each registered version gets Dojo's security checks, and a scheduled workflow adds Cisco's skill-scanner; `add` reads them before installing – a failed check stops it, a warning asks first (`--yes` answers). Manifests can say `private: true` to stay unlisted (`marketplace: false` still works).
- 3d40648: Declare Elysia response object defaults before OpenAPI generation so the live Course API document remains identical to the Fumadocs snapshot after normal endpoint traffic.
