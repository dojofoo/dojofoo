import { SITE_URL } from "./site";
import { SITE_NAME } from "./social-metadata";

/*
 * Schema.org JSON-LD for the pages, from what each page shows. The site's name lives here (WebSite on the home page,
 * the one place Google reads it from) and in og:site_name, so page titles don't repeat it.
 * https://developers.google.com/search/docs/appearance/site-names
 */

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const REPOSITORY = "https://github.com/dojofoo/dojofoo";

type Node = Record<string, unknown>;

/** A head script carrying one JSON-LD graph */
export function jsonLd(...nodes: Node[]) {
  // "<" escaped, so no value can close the script element
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }).replace(/</g, "\\u003c");
  return { type: "application/ld+json", children: json };
}

export const organization: Node = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/dojofoo.svg`,
  sameAs: ["https://github.com/dojofoo"],
};

export const website: Node = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  name: SITE_NAME,
  alternateName: ["dojofoo", "Dojo foo"],
  url: `${SITE_URL}/`,
  publisher: { "@id": ORGANIZATION_ID },
};

/** The CLI the home page runs: `npx dojofoo` (requirements: docs/installation) */
export const cli: Node = {
  "@type": "SoftwareApplication",
  name: "dojofoo",
  description: "The command that opens Dojo.foo's lesson UI, installs courses and lets your coding agent teach them.",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Linux, Windows",
  softwareRequirements: "Node.js 24 or newer",
  url: `${SITE_URL}/docs/quickstart`,
  downloadUrl: "https://www.npmjs.com/package/dojofoo",
  codeRepository: REPOSITORY,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@id": ORGANIZATION_ID },
};

/** The trail to a page, each step a page the site links to */
export function breadcrumbs(trail: ReadonlyArray<readonly [name: string, path: string]>): Node {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], index) => ({ "@type": "ListItem", position: index + 1, name, item: SITE_URL + path })),
  };
}

/** A collection of pages, e.g. the dojos */
export function collection({ name, description, path, items }: { name: string; description: string; path: string; items: ReadonlyArray<{ name: string; path: string }> }): Node {
  return {
    "@type": "CollectionPage",
    name,
    description,
    url: SITE_URL + path,
    isPartOf: { "@id": WEBSITE_ID },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, url: SITE_URL + item.path })),
    },
  };
}

/** A course's own page (Google no longer shows Course rich results, but the type still names the page for other readers) */
export function course({ name, description, path, author, language, tags, publishedAt, version, repositoryUrl }: {
  name: string; description: string; path: string; author: string; language: string; tags: string[]; publishedAt: string; version: string; repositoryUrl: string;
}): Node {
  return {
    "@type": "Course",
    name,
    description,
    url: SITE_URL + path,
    provider: author === SITE_NAME ? { "@id": ORGANIZATION_ID } : { "@type": "Person", name: author },
    isAccessibleForFree: true,
    keywords: [language, ...tags].filter(Boolean).join(", "),
    ...(publishedAt ? { dateModified: publishedAt } : {}),
    ...(version ? { version } : {}),
    sameAs: repositoryUrl,
    isPartOf: { "@id": WEBSITE_ID },
  };
}

/** A docs page */
export function techArticle({ headline, description, path }: { headline: string; description?: string; path: string }): Node {
  return {
    "@type": "TechArticle",
    headline,
    ...(description ? { description } : {}),
    url: SITE_URL + path,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORGANIZATION_ID },
  };
}
