import { PageHead, SitePage } from "@dojofoo/uix/web/site";
import { ButtonLink } from "@dojofoo/uix/components/button";

export function NotFound() {
  return <SitePage window={false}>
    <section className="mx-auto max-w-2xl px-6 py-24 text-center">
      <PageHead kicker="404" title="Page not found" lead="The page you are looking for might have been removed, renamed, or is temporarily unavailable.">
        <ButtonLink className="mt-6" href="/docs">Back to docs</ButtonLink>
      </PageHead>
    </section>
  </SitePage>;
}
