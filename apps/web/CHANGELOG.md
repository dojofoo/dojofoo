# @dojofoo/web

## 0.0.9

### Patch Changes

- 3960f2e: Draw a course's lesson-by-lesson numbers as one chart of stepped areas instead of a bar per lesson, so any number of lessons reads cleanly with no overlapping or misshapen bars. Reached and finished show together under an always-visible legend. Every second lesson is a shade off.
  
  A course's chapters are dotted lines between their lessons, numbered along a top axis, with the lessons numbered along the bottom. Pointing at a lesson, or moving with the arrow keys, reads the lesson out. Pointing at a chapter's number reads out how many reached the chapter and how many finished it. Only the plot scrolls, and only when lessons would be narrower than 3px.
- 523272c: Serve each docs page's Markdown at its address + .md, link it and the llms.txt from the page, and answer agents that ask for Markdown
- 2821986: The docs page's Open menu uses the shared dropdown, so it has its card, shadow and keyboard focus instead of floating unstyled over the page's contents. The search palette picks between Courses and Docs with the editor's tabs: the open tab is joined to its results under the brand line, so it is clear where the search looks.
- Updated dependencies [3960f2e]
- Updated dependencies [523272c]
- Updated dependencies [2821986]
  - @dojofoo/uix@0.2.4
  - @dojofoo/ui@0.2.4

## 0.0.8

### Patch Changes

- 98f2f8a: Show a "Praised and Featured on" section on the landing page after Top courses, with the VibeKing badge. In dark mode the badge drops its box, border and "Featured on" line, and shows VibeKing's logo beside its wordmark, flush with the heading.
- 318c4d3: Refresh workspace dependencies, upgrade the website and UI frameworks, and use patched transitive dependencies for the known security advisories. Retain the audited Eve runtime and native adapter versions and their compatibility patches.
- 8435ed5: Send security headers with every page of the website: a starter Content-Security-Policy that stops other sites framing it and blocks plugins and base-URL rewrites, X-Frame-Options for older browsers, and X-Content-Type-Options.
- Updated dependencies [98f2f8a]
- Updated dependencies [318c4d3]
  - @dojofoo/uix@0.2.3
  - @dojofoo/ui@0.2.3

## 0.0.7

### Patch Changes

- 7e45612: Keep a long course's reach chart readable on narrow screens. The Reached and Finished switch keeps its full words on phones. Pointing at a bar names it on one line, number first, so the chart no longer moves. The keyboard can scroll the bars. As before, only the bars scroll and fade at their edges, and the axis stays in place.
- d5ab06a: Generate smoother small favicons from the SVG and provide seven ICO resolutions, with matching website and Storybook metadata.
- Updated dependencies [7e45612]
- Updated dependencies [584bd27]
- Updated dependencies [d5ab06a]
- Updated dependencies [a356c40]
  - @dojofoo/uix@0.2.2
  - @dojofoo/ui@0.2.2

## 0.0.6

### Patch Changes

- 3358a45: Inline initial route CSS and defer the footer shader until it approaches the viewport. Restore standalone catalog controls and empty states with Tailwind styling, keep navigation aligned across scrolling pages, and place the footer quote mark beside its text. Restore themed Shiki code frames and tabs without Monaco, simplify API parameter lists, and match parameter header typography to code while preserving description-sized values and muted type annotations.
- Updated dependencies [48af084]
- Updated dependencies [f68cf54]
- Updated dependencies [bf7cd76]
- Updated dependencies [3358a45]
  - @dojofoo/uix@0.2.1
  - @dojofoo/ui@0.2.1

## 0.0.5

### Patch Changes

- f08214c: The home page ends with the questions people ask about Dojo.foo, now including what "dojo" means, with FAQPage data.
- 6458235: `add` reads the security checks of the exact version it downloaded, which the course API now runs first when it hasn't checked that version, asks before installing a version no check is for, checks with telemetry off too, and says so when the checks are unavailable.
- 8b234ee: Mark the document with `data-hydrated` once the website has hydrated, so browser tests wait for an interactive page instead of an idle network.
- b374515: Speed up the public website with responsive static AVIF/WebP preview artwork, smaller website-only styles and fonts, deferred documentation and animation code, and a single icon family in the website bundle. Preserve the shared app and Storybook icon choices, navigation, and brand themes. Keep Iosevka on the documentation route only and update the home page FAQ.
- Updated dependencies [f08214c]
- Updated dependencies [1af0002]
- Updated dependencies [55cf41b]
- Updated dependencies [f08214c]
- Updated dependencies [f08214c]
- Updated dependencies [f08214c]
- Updated dependencies [6458235]
- Updated dependencies [f08214c]
- Updated dependencies [68d9304]
- Updated dependencies [f08214c]
- Updated dependencies [37b5b50]
- Updated dependencies [881c61f]
- Updated dependencies [b374515]
  - @dojofoo/ui@0.2.0
  - @dojofoo/uix@0.2.0

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
