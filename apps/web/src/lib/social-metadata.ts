import { SITE, socialMetadata as metadata } from "@dojofoo/uix/web/seo";
import { SITE_URL } from "./site";

/* The site's name, line and tags – from UIX (web/seo), which the Search story previews */

export const SOCIAL_IMAGE_URL = `${SITE_URL}/og.webp`;
export const SITE_NAME = SITE.name;
export const DEFAULT_TITLE = SITE.title;
export const DEFAULT_SOCIAL_DESCRIPTION = SITE.description;

export const socialMetadata = (options: Omit<Parameters<typeof metadata>[0], "siteUrl">) => metadata({ siteUrl: SITE_URL, ...options });

/** The page's one address for search engines: the site's origin and its path, without a trailing slash */
/** A page's own social card: its address + /og.webp */
export const pageImage = (path: string) => `${SITE_URL}${path.replace(/\/$/, "")}/og.webp`;

export function canonicalLink(path: string) {
  return { rel: "canonical", href: SITE_URL + (path === "/" ? "/" : path.replace(/\/$/, "")) };
}
