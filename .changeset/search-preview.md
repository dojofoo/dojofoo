---
"@dojofoo/uix": patch
---

Dojo.foo's search words live in one place, `web/seo`: the site's name and line, each page's tags, its JSON-LD (Course now with its free offer and online, self-paced instance; an FAQPage builder for a page that shows its questions), the results we'd like under the site in Google, and the questions people ask, answered from the docs.

The site is titled "AI mentors, teachers and personas you can install" (no domain in it; the card's alt names Dojo.foo), and its words say what a dojo is beyond coding: courses, interview preps and any teachable subject, free or premium-hosted, run locally or in the cloud – in the site's and /dojos' and /docs' descriptions and the questions people ask. The Search story's snippet is the description as written.

The Web/Search story previews them: the Google result laid out as MasterClass's (sitelinks and people also ask, dark and light, with the planned Membership, Interviews and Sell pages), what's in place and left before Google indexes the site, each page's title, description and card, the link previews, the JSON-LD and the AI crawlers.

The Web/Compare story and `web/compare` show Dojo.foo next to another way to learn, starting with MasterClass (on the site at /vs/masterclass, hidden): what it does well and where Dojo.foo differs, from sources it cites, then the two side by side, under both logos on a streamlines shader (`components/streamlines`, a WebGL port of shadcn.io's) that fades in once drawn (ShaderCanvas marks itself `data-ready`), the aside beside the head and story from the top. Each comparison is a page of Markdown, `apps/web/comparisons/<rival>.mdx`: its head, website and sources in the frontmatter, the story in a `<Story>`, the two side by side in a `<Compare>` of `<Category>`s and `<Row>`s (short words each side; a tooltip on the name only where a row says something inside).
