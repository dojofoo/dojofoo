/*
 * Dojo.foo in search: the site's name and line, each page's tags, its JSON-LD, the results we'd like Google to show
 * under the site (sitelinks: Google picks them, from the pages and how the site links them) and the questions people
 * ask. The website (apps/web: lib/social-metadata, lib/structured-data) builds its head from these, and the Search
 * story (stories/seo.stories) previews them, so both read the same words.
 */

export const SITE = {
  name: "Dojo.foo",
  /** Other names people search for: the CLI's */
  alternateNames: ["dojofoo", "Dojo foo"],
  url: "https://dojo.foo",
  title: "AI mentors, teachers and personas you can install",
  description:
    "Free courses with an agentic sensei who mentors you through every challenge. Take a course, rehearse an interview, or build your own agentic premium dojo.",
  twitter: "@tomhacks",
  repository: "https://github.com/dojofoo/dojofoo",
  github: "https://github.com/dojofoo",
} as const;

type Node = Record<string, unknown>;

/** A page's tags: its description, Open Graph and X card */
export function socialMetadata({ siteUrl = SITE.url, title, description, url, type = "website", image = `${siteUrl}/og.webp` }: {
  siteUrl?: string;
  title: string;
  description: string;
  url: string;
  /** The page's own card (its address + /og.webp); the site's otherwise */
  image?: string;
  type?: "article" | "website";
}) {
  // The site's card shows its logo and line; a page's own shows the page's title
  const imageAlt = image === `${siteUrl}/og.webp` ? `${SITE.name}: ${SITE.title}` : title;
  return [
    { name: "description", content: description },
    { property: "og:type", content: type },
    { property: "og:url", content: url },
    { property: "og:site_name", content: SITE.name },
    { property: "og:locale", content: "en_US" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: image },
    { property: "og:image:secure_url", content: image },
    { property: "og:image:type", content: "image/webp" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: imageAlt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: SITE.twitter },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: imageAlt },
  ];
}

/** A head script carrying one JSON-LD graph */
export function jsonLd(...nodes: Node[]) {
  // "<" escaped, so no value can close the script element
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }).replace(/</g, "\\u003c");
  return { type: "application/ld+json", children: json };
}

/**
 * Schema.org JSON-LD for the pages, from what each page shows, at a site's address (the website's own; a preview's).
 * The site's name lives in WebSite on the home page, the one place Google reads it from, and in og:site_name, so page
 * titles don't repeat it: https://developers.google.com/search/docs/appearance/site-names
 */
export function structuredData(siteUrl: string = SITE.url) {
  const organizationId = `${siteUrl}/#organization`;
  const websiteId = `${siteUrl}/#website`;

  const organization: Node = {
    "@type": "Organization",
    "@id": organizationId,
    name: SITE.name,
    url: `${siteUrl}/`,
    logo: `${siteUrl}/dojofoo.svg`,
    sameAs: [SITE.github],
  };

  const website: Node = {
    "@type": "WebSite",
    "@id": websiteId,
    name: SITE.name,
    alternateName: SITE.alternateNames,
    url: `${siteUrl}/`,
    publisher: { "@id": organizationId },
  };

  /** The CLI the home page runs: `npx dojofoo` (requirements: docs/installation) */
  const cli: Node = {
    "@type": "SoftwareApplication",
    name: "dojofoo",
    description: "The command that opens Dojo.foo's lesson UI, installs courses and lets your coding agent teach them.",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Linux, Windows",
    softwareRequirements: "Node.js 24 or newer",
    url: `${siteUrl}/docs/quickstart`,
    downloadUrl: "https://www.npmjs.com/package/dojofoo",
    codeRepository: SITE.repository,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": organizationId },
  };

  /** The trail to a page, each step a page the site links to */
  const breadcrumbs = (trail: ReadonlyArray<readonly [name: string, path: string]>): Node => ({
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], index) => ({ "@type": "ListItem", position: index + 1, name, item: siteUrl + path })),
  });

  /** A collection of pages, e.g. the dojos */
  const collection = ({ name, description, path, items }: { name: string; description: string; path: string; items: ReadonlyArray<{ name: string; path: string }> }): Node => ({
    "@type": "CollectionPage",
    name,
    description,
    url: siteUrl + path,
    isPartOf: { "@id": websiteId },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, url: siteUrl + item.path })),
    },
  });

  /**
   * A course's own page. Google no longer shows Course rich results, but the type still names the page for other
   * readers (AI answers among them): free, online, self-paced, in English, taught in the learner's own project
   */
  const course = ({ name, description, path, author, language, tags, publishedAt, version, repositoryUrl }: {
    name: string; description: string; path: string; author: string; language: string; tags: string[]; publishedAt: string; version: string; repositoryUrl: string;
  }): Node => ({
    "@type": "Course",
    name,
    description,
    url: siteUrl + path,
    provider: author === SITE.name ? { "@id": organizationId } : { "@type": "Person", name: author },
    isAccessibleForFree: true,
    inLanguage: "en",
    ...(language ? { teaches: language } : {}),
    keywords: [language, ...tags].filter(Boolean).join(", "),
    offers: { "@type": "Offer", category: "Free", price: "0", priceCurrency: "USD" },
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "Online", courseWorkload: "Self-paced" },
    ...(publishedAt ? { dateModified: publishedAt } : {}),
    ...(version ? { version } : {}),
    sameAs: repositoryUrl,
    isPartOf: { "@id": websiteId },
  });

  /** A docs page */
  const techArticle = ({ headline, description, path }: { headline: string; description?: string; path: string }): Node => ({
    "@type": "TechArticle",
    headline,
    ...(description ? { description } : {}),
    url: siteUrl + path,
    inLanguage: "en",
    isPartOf: { "@id": websiteId },
    publisher: { "@id": organizationId },
  });

  /** The questions a page answers, as it shows them (only on a page that shows them) */
  const faqPage = (questions: ReadonlyArray<Question>): Node => ({
    "@type": "FAQPage",
    mainEntity: questions.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })),
  });

  return { organization, website, cli, breadcrumbs, collection, course, techArticle, faqPage };
}

/** A page we'd like under the site in a search, as a sitelink: live, or planned (not a page yet) */
export type SearchPage = {
  path: string;
  /** The sitelink's heading: the page's title as Google would shorten it */
  label: string;
  /** The page's <title> */
  title: string;
  description: string;
  status: "live" | "planned" | "blocked";
  /** What stands between it and the result, when it isn't live */
  note?: string;
};

/** The results under Dojo.foo, in the order we'd like them (MasterClass's: log in, categories, membership, …) */
export const searchPages: SearchPage[] = [
  {
    path: "/sign-in",
    label: "Log In",
    title: "Log in",
    description: "Pick up your courses where you left off, with your progress and your sensei.",
    status: "blocked",
    note: "Kept out of search (robots.txt, noindex) while registration is closed",
  },
  {
    path: "/dojos",
    label: "Courses / Dojos",
    title: "Find your dojo – Free coding courses with an AI sensei",
    description: "Check out our free or premium-hosted packages (dojos) with their own senseis.",
    status: "live",
  },
  {
    path: "/membership",
    label: "Membership",
    title: "Membership",
    description: "What a membership adds to the free courses.",
    status: "planned",
    note: "No page yet; its benefits and price aren't set",
  },
  {
    path: "/interviews",
    label: "Automated interviews for companies",
    title: "Automated interviews for companies",
    description: "Take-home interviews your candidates work through with a sensei, in their own editor.",
    status: "planned",
    note: "No page yet; the Interview teaching style exists in the courses",
  },
  {
    path: "/sell",
    label: "Sell your dojo & sensei",
    title: "Sell your dojo & sensei",
    description: "Turn what you know into a course, with a sensei that teaches it for you.",
    status: "planned",
    note: "No page yet; publishing a free course is live (/authoring)",
  },
  {
    path: "/docs",
    label: "Help & Support",
    title: "Usage",
    description: "Documentation for using, authoring and understanding how dojos work.",
    status: "live",
  },
];

/** A planned or live page's entry, by its path (the website's pages take their title and description from it) */
export const searchPage = (path: string) => {
  const page = searchPages.find((item) => item.path === path);
  if (!page) throw new Error(`No search entry for ${path}`);
  return page;
};

/** A question people ask about Dojo.foo, and its answer: confirmed from the docs, or a draft to decide */
export type Question = { question: string; answer: string; status: "confirmed" | "draft"; source?: string };

export const questions: Question[] = [
  {
    question: "What is Dojo.foo?",
    answer: "Dojo.foo is an open-source platform for AI mentors: courses, interview preps and any other teachable subject, packaged with an agent that teaches it. Run it locally, or use its cloud features to take your courses with you.",
    status: "confirmed",
    source: "/docs",
  },
  {
    question: "Is Dojo.foo free?",
    answer: "Yes. Besides premium courses for paying customers, most courses are free to install and take, and the full source code is available on GitHub. You bring your own coding agent or connect to your AI provider (ChatGPT).",
    status: "confirmed",
    source: "/docs/installation",
  },
  {
    question: "Which coding agents and platforms does Dojo.foo support?",
    answer: "Claude Code, Codex, Copilot, Epicat, OpenCode, Pi, Grok, Antigravity and FX, along with agents that support the Agent Client Protocol (ACP). Use your ChatGPT account directly, without a coding agent.",
    status: "confirmed",
    source: "/docs/installation",
  },
  {
    question: "How do I start a course?",
    answer: "The easiest way is a Dojo.foo cloud subscription. To run courses locally, run npx dojofoo – it opens an onboarding dialog that guides you through the setup and courses.",
    status: "confirmed",
    source: "/docs/quickstart",
  },
  {
    question: "What does the sensei do?",
    answer: "The sensei is tailored to the dojo you install. A dojo can be a course that needs a patient teacher, a kata that needs coding guidance, or an interview that challenges you as a candidate. If you can imagine learning something in a conversation with someone, that's what the sensei does best.",
    status: "confirmed",
    source: "/docs",
  },
  {
    question: "Is it safe to install a course?",
    answer: "Every version of a listed course passes security checks. Code that runs on install earns a warning and you're asked first; a script piped from the internet fails the checks, and the course can't be installed until it's fixed.",
    status: "confirmed",
    source: "/authoring/publish",
  },
  {
    question: "Does Dojo.foo see my code?",
    answer: "No. The CLI sends four anonymous events – a course installed, started, a kata completed, the course finished – and never file paths, your code or your agent's conversations. You can turn even those off.",
    status: "confirmed",
    source: "/docs/privacy",
  },
  {
    question: "Can I publish my own course?",
    answer: "Yes. Push it to a public GitHub repository and anyone can add it by its name. The marketplace lists it once it's reviewed and its security checks pass.",
    status: "confirmed",
    source: "/authoring/publish",
  },
  {
    question: "How much is a Dojo.foo membership?",
    answer: "To decide: what a membership adds to the free courses, and its price.",
    status: "draft",
  },
  {
    question: "Can companies run interviews on Dojo.foo?",
    answer: "To decide: interviews as take-home courses with a sensei, and what companies get from them.",
    status: "draft",
  },
];
