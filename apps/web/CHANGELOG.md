# @dojofoo/web

## 0.0.4

### Patch Changes

- abe8e5f: Prerender the landing illustration without Monaco or application hydration, keep its card shader live, and expose named logos and a concise illustration in the accessibility tree. Deduplicate website CSS presets and minify locally served editor assets with fingerprinted cache URLs.
- Updated dependencies [abe8e5f]
  - @dojofoo/uix@0.1.1
  - @dojofoo/ui@0.1.1

## 0.0.3

### Patch Changes

- 7f58b64: Generate ICO and PNG favicon fallbacks from the SVG, share icon declarations between the website and search sandbox, and align the homepage Open Graph URL with its canonical URL. Update the sandbox with verified Search Console setup, the unpublished catalog and Google's indexing conditions.
- Updated dependencies [ea5f1db]
- Updated dependencies [e9f028f]
- Updated dependencies [ea5f1db]
- Updated dependencies [f52a74f]
- Updated dependencies [ef7bae5]
- Updated dependencies [7f58b64]
  - @dojofoo/ui@0.1.0
  - @dojofoo/uix@0.1.0

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
