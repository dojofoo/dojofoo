import { BrandLogo } from "@dojofoo/ui/brand-logo";

const columns = [
  {
    title: "Learn",
    links: [
      { label: "Usage", href: "/docs" },
      { label: "Quickstart", href: "/docs/quickstart" },
      { label: "Installation", href: "/docs/installation" },
    ],
  },
  {
    title: "Explore",
    links: [
      { label: "Dojos", href: "/dojos" },
      { label: "Authoring", href: "/authoring" },
      { label: "Developers", href: "/developers" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "GitHub", href: "https://github.com/dojofoo/dojofoo" },
      { label: "Issues", href: "https://github.com/dojofoo/dojofoo/issues" },
      { label: "Roadmap", href: "https://github.com/dojofoo/dojofoo/blob/main/ROADMAP.md" },
      { label: "License", href: "https://github.com/dojofoo/dojofoo/blob/main/packages/cli/LICENSE" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="w-full border-border border-t [border-top-style:dashed]">
      <div className="grid grid-cols-2 border-border md:grid-cols-4">
        <div className="border-border border-r border-b [border-right-style:dashed] [border-bottom-style:dashed] p-6">
          <a href="/" aria-label="Dojo home" className="inline-flex min-h-11 min-w-11 items-center justify-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <BrandLogo className="h-3.5 w-11" />
          </a>
          <p className="mt-4 max-w-64 text-muted-foreground text-sm leading-6">
            Deliberate practice, guided by the coding agent you already use.
          </p>
        </div>
        {columns.map((column) => (
          <div className="border-border border-r border-b [border-right-style:dashed] [border-bottom-style:dashed] p-6 last:border-r-0" key={column.title}>
            <p className="font-display text-[11px] font-medium text-muted-foreground uppercase tracking-[0.14em]">
              {column.title}
            </p>
            <ul className="mt-4 flex flex-col gap-2.5 pl-0">
              {column.links.map((link) => (
                <li key={link.label}>
                  <a className="text-foreground text-sm transition-colors hover:text-primary" href={link.href}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-start justify-between gap-2 border-border border-b [border-bottom-style:dashed] px-6 py-5 font-display text-[10px] font-medium text-muted-foreground uppercase tracking-[0.14em] sm:flex-row sm:items-center">
        <span>© dojofoo</span>
        <a
          className="transition-colors hover:text-foreground"
          href="https://x.com/tomhacks"
          rel="noreferrer"
          target="_blank"
        >
          Created with love by Tom Siwik
        </a>
      </div>
    </footer>
  );
}
