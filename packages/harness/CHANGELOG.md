# @dojofoo/harness

## 0.1.1

### Patch Changes

- af900ba: Prerender the landing, course catalog, and public documentation with cached documentation loader data and preload the primary navigation. Refresh the initial catalog snapshot from the API while retaining router view transitions and browser history. Rename the landing action to Start learning.
  
  Normalize sitemap URLs, let crawlers read authentication pages' noindex directives, and distinguish the SEO sandbox's next-build metadata from its deployment audit. Keep unpublished courses private.
  
  Regenerate the API reference after the dependency update and restore build compatibility with the updated React and Base UI types. Restore the SDK versions compatible with the existing chat and agent adapters and retain the audited runtime dependency pin.

## 0.1.0

### Minor Changes

- Publish the agent and authoring runtime required by CLI installations. Support
  editable master courses, portable Kyoshi definitions, chapter-based course
  material, isolated lesson trials, and durable authoring question/queue recovery.
