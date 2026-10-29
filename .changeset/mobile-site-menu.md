---
"@dojofoo/uix": patch
---

On phones the website works like a phone site:
- The header folds its sections into a menu beside the search. The search and menu buttons are plain icons whose hit areas touch.
- The menu is Arc's drawer, timed on Fluid Functionalism's moderate tier (in 0.16s, out 0.12s). Drag its head to close it.
- The docs move their sections and pages into that menu. What's on the page becomes a bar under the header that names the part being read and folds open into the outline over the page.
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
