# @dojofoo/agents

## 0.1.2

### Patch Changes

- 6207895: Run the local dashboard through the bundled Portless dependency, guide first-time setup with automatic agent discovery, and retain workspace and course progress through stable course and session routes.
  
  Share the authoring sidebar with Storybook, support chapters and lesson renaming, scaffold course README.md and chapter/lesson INTRO files from templates, and add dashboard course deletion menus. Reuse the shared navigation, scrolling, card editor, slide presentation, and error-page components across the local UI and website.
  
  Collapsed sidebars hide full-size cards and custom file trees while retaining their expanded state; authoring keeps the shared icon rail.
- af900ba: Prerender the landing, course catalog, and public documentation with cached documentation loader data and preload the primary navigation. Refresh the initial catalog snapshot from the API while retaining router view transitions and browser history. Rename the landing action to Start learning.
  
  Normalize sitemap URLs, let crawlers read authentication pages' noindex directives, and distinguish the SEO sandbox's next-build metadata from its deployment audit. Keep unpublished courses private.
  
  Regenerate the API reference after the dependency update and restore build compatibility with the updated React and Base UI types. Restore the SDK versions compatible with the existing chat and agent adapters and retain the audited runtime dependency pin.
- Updated dependencies [6207895]
- Updated dependencies [af900ba]
  - @dojofoo/config@0.3.0
  - @dojofoo/agent@0.1.1

## 0.1.1

### Patch Changes

- Updated dependencies [9b85745]
- Updated dependencies [b55d1a4]
  - @dojofoo/config@0.2.0

## 0.1.0

### Minor Changes

- Publish the agent and authoring runtime required by CLI installations. Support
  editable master courses, portable Kyoshi definitions, chapter-based course
  material, isolated lesson trials, and durable authoring question/queue recovery.
- Include the tested OpenCode bridge and scaffold ignore rules in npm artifacts.

### Patch Changes

- Updated dependencies [5067020]
- Updated dependencies
  - @dojofoo/config@0.1.0
  - @dojofoo/agent@0.1.0
