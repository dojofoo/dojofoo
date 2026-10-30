# @dojofoo/uix

## 0.0.3

### Patch Changes

- d093333: On phones the website works like a phone site:
  - The header folds its sections into a menu beside the search. The search and menu buttons are plain icons whose hit areas touch.
  - The menu is epicat's sidebar drawer: it slides in on CSS keyframes, and its close sits where the burger was.
  - The docs move their sections and pages into that menu: the sections in a dropdown like the user menu, then the open section's pages in taller rows. What's on the page becomes a bar under the header that names the part being read and folds open into the outline over the page, also with taller rows.
  - The landing's app preview is the app's own narrow layout, with only its sidebar and Sensei toggles live.
  - "Works with" shows three agents at a time, in five quicker turns.
  - The modes carousel takes Fluid's CarouselDots: 6px dots, a 24px pill filling from the left, 18px round hit areas and a gliding hover highlight. It sits closer to its windows.
  - The dojos page keeps each filter's name in place while its choices scroll, and sorts from an icon-only button.
  - The footer's quote is right-aligned.
  - Interview joins the teaching styles the dojos can be filtered by.
  - A course page's weekly activity and its lesson-by-lesson reach collapse into one rounded bar chart: one bar per lesson, labelled every five, switching between Reached and Finished.
  
  Dojo.foo's pages now carry their own SEO, with a sitemap and robots.txt:
  - Their own titles, with the site's name only on the home page.
  - Descriptions and canonical links.
  - JSON-LD:
    - home: WebSite, Organization and the CLI as a SoftwareApplication;
    - dojos: CollectionPage;
    - each course: Course with breadcrumbs;
    - each docs page: TechArticle with breadcrumbs.
  - An llms.txt in the llmstxt.org shape, and a headed llms-full.txt.
  - A social card drawn on the footer's contour map.

## 0.0.2

### Patch Changes

- 9394f74: Align shared highlighter and schema dependency types before adopting UIX in the local learning application, and preserve valid HTML fragments in teaching Markdown hovers.
- 2e98a34: Let the sign-in and sign-up blocks hide social sign-in and account creation, both closed unless the host opens them. With registration closed, signing up shows that registrations are closed and signing in no longer offers to create an account.
- 67df541: The landing page opens with Miyamoto Musashi's "You can only fight the way you practice", credited beneath it, in place of the shader-lit tagline, and a lead about deliberate practice with a sensei in your own dojo. The unused shader text component is gone.
- 2e98a34: Show Log in and Log out in the account menu only when the host provides them. The local UI has no accounts, so its menu now ends at the theme row instead of offering both placeholder actions.
- b6e09a7: Render the local course library through shared UIX presentation while preserving real installation discovery, workspace/session choices, native links and empty/error states.
- bf44267: Render native Fumadocs documentation inside the shared UIX frame, preserve host navigation and compiled heading metadata, and align documentation stories with the same controlled presentation.
- c0173fd: Use shared UIX presentation for the public website, preserve real navigation and course data, and isolate the illustrative learning preview from learner controllers. Add native button links and handle document transition interruptions through the shared document bootstrap.
- bf6314c: Share UIX providers and library-owned assets across application hosts and Storybook. Require application-supplied prepared OpenAPI data and keep preview content behind story adapters so the bundled local UI can adopt the shared presentation safely.
