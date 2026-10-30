import { jsonLd, structuredData } from "@dojofoo/uix/web/seo";
import { SITE_URL } from "./site";

/* Schema.org JSON-LD for the pages, at the site's own address – built in UIX (web/seo), which the Search story previews */

export { jsonLd };
export const { organization, website, cli, breadcrumbs, collection, course, techArticle, faqPage } = structuredData(SITE_URL);
