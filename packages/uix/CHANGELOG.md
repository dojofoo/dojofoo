# @dojofoo/uix

## 0.2.1

### Patch Changes

- 48af084: Sign a coding agent in from the composer. Pi and Codex list the accounts they can use and sign in to one: a browser sign-in shows its page (or a code to enter), an API key is asked for in a password field. The agent saves the login where it keeps its own and renews it itself. An agent signed in to nothing shows "Sign in to <agent>" where the model menu would be, the model menu has a "Sign in…" row, and a failed turn that needs a login offers the same sign-in. A lapsed Pi login now reads "Sign in to GitHub Copilot again".

  The harness's sign-in is Pi's interface: `agentAccess(agent)` from `@dojofoo/harness/adapters` lists providers as Pi's model runtime does and logs in through Pi's `AuthInteraction` (events to show, questions to answer). Pi runs its own login; Codex runs its app-server's (`account/read`, `account/login/start`). The session API serves it under `/agents/{id}/providers` and `/logins`, with the page's launch token. Protocol carries Pi's sign-in types in their JSON form, and the harness build fails if they stop matching Pi's.
- bf7cd76: OpenCode signs in from the composer too, through Sensei's OpenCode server: any of its providers takes an API key, and the ones with a sign-in of their own (ChatGPT, GitHub Copilot, GitLab, xAI, …) open it in the browser after their questions (GitHub.com or Enterprise, say), pasting back a code where the page shows one. OpenCode saves the login in the user's data folder, which Sensei's OpenCode reads. A provider whose key needs more than the key (Azure's resource name) points to OpenCode's own terminal. The sign-in dialog's fields get an outline outside the onboarding.
- 3358a45: Inline initial route CSS and defer the footer shader until it approaches the viewport. Restore standalone catalog controls and empty states with Tailwind styling, keep navigation aligned across scrolling pages, and place the footer quote mark beside its text. Restore themed Shiki code frames and tabs without Monaco, simplify API parameter lists, and match parameter header typography to code while preserving description-sized values and muted type annotations.
- Updated dependencies [48af084]
  - @dojofoo/protocol@0.1.2

## 0.2.0

### Minor Changes

- f08214c: The account menu opens pages of their own: Settings at /settings/theme and /settings/profile, Profile at /me, which shows the learner's courses with their progress and the courses they finished as certificates. A check card no longer says "Sensei saw this".

### Patch Changes

- 1af0002: Every coding agent gets the same model menu. A long model list can be searched, and a model the agent can't run now is listed last, muted, with what to do ("Sign in to GitHub Copilot again: run pi, then /login", "Not in your GitHub Copilot plan"). A conversation without a model no longer shows the first model as chosen, and a model without a default effort of its own shows Default until a level is picked.
  
  Pi starts a new conversation on the default model in its settings.json while that model can run, else on the first one that can, instead of on a model whose expired sign-in Sensei can't renew. OpenCode lists its models by name with their reasoning variants as efforts, from the copy Sensei runs, and a new conversation names the model OpenCode picks itself. Kyoshi's conversations start on the same configured model as Sensei's.
  
  Onboarding shows an agent found on this machine that Dojo can't teach through yet (Cursor, Antigravity) as not supported instead of offering it.
- f08214c: The model menu shows only an effort the chosen model takes, so a level picked for another model no longer sticks after a switch, and the effort row shows no selection when none applies. A conversation whose effort is cleared by a model change also clears the workspace's saved effort, so the next conversation starts at its model's default.
- f08214c: The home page ends with the questions people ask about Dojo.foo, now including what "dojo" means, with FAQPage data.
- 6458235: `add` reads the security checks of the exact version it downloaded, which the course API now runs first when it hasn't checked that version, asks before installing a version no check is for, checks with telemetry off too, and says so when the checks are unavailable.
- f08214c: Sensei's model menu shows each Claude Code model's default effort, picks the effort with the shared segmented control, drops the keyboard hints and Claude Code's "(recommended)" label; a cancelled question says so in the brand color and mutes its options.
- b374515: Speed up the public website with responsive static AVIF/WebP preview artwork, smaller website-only styles and fonts, deferred documentation and animation code, and a single icon family in the website bundle. Preserve the shared app and Storybook icon choices, navigation, and brand themes. Keep Iosevka on the documentation route only and update the home page FAQ.
- Updated dependencies [1af0002]
- Updated dependencies [f08214c]
  - @dojofoo/protocol@0.1.1

## 0.1.1

### Patch Changes

- abe8e5f: Prerender the landing illustration without Monaco or application hydration, keep its card shader live, and expose named logos and a concise illustration in the accessibility tree. Deduplicate website CSS presets and minify locally served editor assets with fingerprinted cache URLs.

## 0.1.0

### Minor Changes

- ef7bae5: Sensei's model menu lists each model with its version and description, as the coding agent does (Claude Code through its Agent SDK), and lets the learner choose the model's effort.

### Patch Changes

- ea5f1db: Sensei runs on Eve like Kyoshi, and every coding agent dojofoo offers runs both, after passing conformance. Each workspace has one coding agent, chosen in the composer.
  
  Sensei cannot write the solution file, and a change made while Sensei works is restored and named.
  
  Pages are addressed by draft and by course run, open their conversation by themselves, and list earlier ones in a history menu.
  
  Course evaluation runs in the UI on the draft's coding agent, with one consent switch, and `dojofoo kyoshi evaluate` is gone.
  
  The internal packages are `@dojofoo/harness` (formerly `@dojofoo/agent` and `@dojofoo/agent-api`) and `@dojofoo/agents` (formerly `@dojofoo/authoring`).
- e9f028f: A question the agent cancelled says "× Cancelled" in its own footer instead of an error line under it.
- 7f58b64: Generate ICO and PNG favicon fallbacks from the SVG, share icon declarations between the website and search sandbox, and align the homepage Open Graph URL with its canonical URL. Update the sandbox with verified Search Console setup, the unpublished catalog and Google's indexing conditions.
- Updated dependencies [ea5f1db]
- Updated dependencies [ef7bae5]
  - @dojofoo/protocol@0.1.0

## 0.0.4

### Patch Changes

- 6207895: Run the local dashboard through the bundled Portless dependency, guide first-time setup with automatic agent discovery, and retain workspace and course progress through stable course and session routes.
  
  Share the authoring sidebar with Storybook, support chapters and lesson renaming, scaffold course README.md and chapter/lesson INTRO files from templates, and add dashboard course deletion menus. Reuse the shared navigation, scrolling, card editor, slide presentation, and error-page components across the local UI and website.
  
  Collapsed sidebars hide full-size cards and custom file trees while retaining their expanded state; authoring keeps the shared icon rail.
- 01317a9: Dojo.foo's search words live in one place, `web/seo`: the site's name and line, each page's tags, its JSON-LD (Course now with its free offer and online, self-paced instance; an FAQPage builder for a page that shows its questions), the results we'd like under the site in Google, and the questions people ask, answered from the docs.
  
  The site is titled "AI mentors, teachers and personas you can install" (no domain in it; the card's alt names Dojo.foo), and its words say what a dojo is beyond coding: courses, interview preps and any teachable subject, free or premium-hosted, run locally or in the cloud – in the site's and /dojos' and /docs' descriptions and the questions people ask. The Search story's snippet is the description as written.
  
  The Web/Search story previews them: the Google result laid out as MasterClass's (sitelinks and people also ask, dark and light, with the planned Membership, Interviews and Sell pages), what's in place and left before Google indexes the site, each page's title, description and card, the link previews, the JSON-LD and the AI crawlers.
  
  The Web/Compare story and `web/compare` show Dojo.foo next to another way to learn, starting with MasterClass (on the site at /vs/masterclass, hidden): what it does well and where Dojo.foo differs, from sources it cites, then the two side by side, under both logos on a streamlines shader (`components/streamlines`, a WebGL port of shadcn.io's) that fades in once drawn (ShaderCanvas marks itself `data-ready`), the aside beside the head and story from the top. Each comparison is a page of Markdown, `apps/web/comparisons/<rival>.mdx`: its head, website and sources in the frontmatter, the story in a `<Story>`, the two side by side in a `<Compare>` of `<Category>`s and `<Row>`s (short words each side; a tooltip on the name only where a row says something inside).
- 01317a9: The Sensei's chat renders in uix: `components/streamed-message` (its activity panel, questions, checks and attachments), `components/chat-transcript`, `components/agent-question` and `components/ask-user-questions` moved from packages/ui, which keeps only what the app knows – Eve's tool calls and questions, its own lesson messages, the authored fragments it shows.
  
  Its Markdown is Streamdown (`components/chat-markdown`): headings, nested and task lists, quotes, tables, links, rules, emphasis and strikethrough in the chat's own type, fenced code in a CodeBlock, and `[highlight:L3-5]` as a chip that highlights those lines in the editor. Turns in the chat pane keep the column's spacing (`ui-as-chat__turns`), and ask-user tools keep `multiSelect`.
  
  Storybook's Components/Organisms/Sensei Chat shows the chat on the right of a lesson, as the app does: thinking, working, waiting, testing, checks that fail and pass, tool calls, questions with one answer, several, an open one and an answered one, line highlights, Markdown and a streaming reply. The Conversation story and Chat/Activity's stories of components the app doesn't use are gone; the Interactive lesson and the demo pages' chats (Pages/Dojo and others) render through the same renderer.
- af900ba: Prerender the landing, course catalog, and public documentation with cached documentation loader data and preload the primary navigation. Refresh the initial catalog snapshot from the API while retaining router view transitions and browser history. Rename the landing action to Start learning.
  
  Normalize sitemap URLs, let crawlers read authentication pages' noindex directives, and distinguish the SEO sandbox's next-build metadata from its deployment audit. Keep unpublished courses private.
  
  Regenerate the API reference after the dependency update and restore build compatibility with the updated React and Base UI types. Restore the SDK versions compatible with the existing chat and agent adapters and retain the audited runtime dependency pin.
- Updated dependencies [6207895]
  - @dojofoo/config@0.3.0

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
