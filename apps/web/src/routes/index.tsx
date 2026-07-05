import { createFileRoute, Link } from "@tanstack/react-router"
import { GithubIcon } from "@/components/github-icon"
import { HeroSection } from "@/components/ui/hero-1"
import { InstallCommand } from "@/components/install-command"
import { ThemeToggle } from "@/components/layout/theme-toggle"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 sm:top-6">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-1 px-4 sm:px-6">
          <ThemeToggle className="pointer-events-auto" />
          <a
            href="https://github.com/tomsiwik/dojocho"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="pointer-events-auto inline-flex size-8 items-center justify-center rounded-md p-2 text-fd-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <GithubIcon className="size-4" />
          </a>
          <Link
            to="/$"
            params={{ _splat: "docs" }}
            className="pointer-events-auto ms-1 inline-flex items-center rounded-md border border-border/60 bg-background/40 px-3 py-1.5 text-sm text-foreground/80 backdrop-blur-sm transition-colors hover:border-primary/60 hover:text-primary"
          >
            Documentation
          </Link>
        </div>
      </div>
      <HeroSection />

      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-10 px-6 py-12 md:grid-cols-2 md:gap-16">
        {/* Left: what dojocho is */}
        <div className="space-y-6 text-foreground/70 leading-relaxed text-base md:text-lg">
          <p>
            Coding katas, but you're not alone. You work through each
            challenge while an AI agent follows along.
          </p>
          <p>
            It runs your tests, spots where you're stuck, and asks
            questions to nudge you in the right direction. Think pair
            programming with a patient mentor who knows the material but
            lets you do the typing.
          </p>
        </div>

        {/* Right: install + usage */}
        <div className="space-y-8">
          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Install
            </h2>
            <InstallCommand />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Usage
            </h2>
            <pre className="overflow-x-auto rounded-md border border-border bg-background p-4 font-mono text-sm text-foreground leading-relaxed">
              <span>dojo setup</span>            <span className="text-muted-foreground"># set up your dojo</span>{"\n"}
              <span>dojo add effect-ts</span>    <span className="text-muted-foreground"># add a training pack</span>{"\n"}
{"\n"}
              <span>claude /kata</span>          <span className="text-muted-foreground"># start practicing</span>
            </pre>
          </div>
        </div>
      </section>

      <footer className="flex items-center justify-center gap-4 py-12">
        <img
          src="/avatar.jpg"
          alt=""
          className="size-8 rounded-full"
        />
        <a
          href="https://x.com/tomhacks"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="X"
          className="text-foreground transition-opacity hover:opacity-70"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
      </footer>
    </main>
  )
}
