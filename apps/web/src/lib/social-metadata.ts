import { SITE_URL } from "./site";

export const SOCIAL_IMAGE_URL = `${SITE_URL}/og.webp`;
export const SITE_NAME = "Dojo.foo";
export const DEFAULT_TITLE = "Dojo.foo – Free courses with agentic tutors";
export const DEFAULT_SOCIAL_DESCRIPTION =
  "Free courses with an agentic sensei who mentors you through every challenge. Take any course, rehearse for your next interview, or build a dojo of your own.";

interface SocialMetadataOptions {
  title: string;
  description: string;
  url: string;
  /** The page's own card (/og/<path>/og.webp); the site's otherwise */
  image?: string;
  type?: "article" | "website";
}

export function socialMetadata({
  title,
  description,
  url,
  type = "website",
  image = SOCIAL_IMAGE_URL,
}: SocialMetadataOptions) {
  // The site's card shows its line; a page's own shows the page's title
  const imageAlt = image === SOCIAL_IMAGE_URL ? DEFAULT_TITLE : title;

  return [
    { name: "description", content: description },
    { property: "og:type", content: type },
    { property: "og:url", content: url },
    { property: "og:site_name", content: SITE_NAME },
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
    { name: "twitter:site", content: "@tomhacks" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: imageAlt },
  ];
}

/** The page's one address for search engines: the site's origin and its path, without a trailing slash */
/** A page's own social card: /og/<its path>/og.webp */
export const pageImage = (path: string) => `${SITE_URL}/og${path === "/" ? "" : path.replace(/\/$/, "")}/og.webp`;

export function canonicalLink(path: string) {
  return { rel: "canonical", href: SITE_URL + (path === "/" ? "/" : path.replace(/\/$/, "")) };
}
