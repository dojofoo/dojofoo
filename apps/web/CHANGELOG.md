# @dojofoo/web

## 0.0.2

### Patch Changes

- fb55e99: The website is versioned like the packages it's built from: a release tags it (`@dojofoo/web@x.y.z`), and the release run promotes that commit's deployment to dojo.foo. The release workflow uses changesets/action v2's inputs (`publish-script`, `version-script`), which push the tags and report private packages' tags as published, and checks the CLI on npm only when a new version of it was published.
- af900ba: Prerender the landing, course catalog, and public documentation with cached documentation loader data and preload the primary navigation. Refresh the initial catalog snapshot from the API while retaining router view transitions and browser history. Rename the landing action to Start learning.
  
  Normalize sitemap URLs, let crawlers read authentication pages' noindex directives, and distinguish the SEO sandbox's next-build metadata from its deployment audit. Keep unpublished courses private.
  
  Regenerate the API reference after the dependency update and restore build compatibility with the updated React and Base UI types. Restore the SDK versions compatible with the existing chat and agent adapters and retain the audited runtime dependency pin.
- Updated dependencies [6207895]
- Updated dependencies [01317a9]
- Updated dependencies [01317a9]
- Updated dependencies [af900ba]
  - @dojofoo/ui@0.0.5
  - @dojofoo/uix@0.0.4
