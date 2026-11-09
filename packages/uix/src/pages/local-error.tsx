import { ShellStyles } from "../components/app-shell";
import { BrandLogo } from "../components/brand-logo";
import { Button } from "../components/button";
import { CodeWindowBlock } from "../components/code-window";

/** The local router supplies the diagnostic and recovery action; UIX owns the screen. */
export function LocalErrorPage({ trace, onRetry }: { trace: string; onRetry(): void }) {
  return <main className="ui-as ui-local-error bg-(--panel) text-(--ink)" aria-labelledby="local-error-title">
    <ShellStyles />
    <style href="ui-local-error" precedence="default">{css}</style>
    <div className="ui-local-error__content">
      <a href="/" className="mx-auto mb-8 flex w-fit" aria-label="Dojo dashboard">
        <BrandLogo className="aspect-[2567/1211] h-[30px] w-auto" />
      </a>
      <section className="ui-ob-card">
        <div className="ui-ob-step ui-local-error__card">
          <header>
            <p className="m-0 text-xs text-(--muted)">Local UI error</p>
            <h1 id="local-error-title" className="mt-2 mb-0 text-2xl leading-tight font-semibold tracking-tight">Something went wrong</h1>
            <p className="mt-3 mb-0 text-sm leading-relaxed text-(--muted)">Dojo couldn’t open this page. Try again, or return to your courses.</p>
          </header>
          <div className="ui-local-error__trace" aria-label="Error details">
            <CodeWindowBlock code={trace} lang="text" />
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <Button onClick={onRetry}>Try again</Button>
            <a href="/" className="text-sm text-(--muted) underline underline-offset-4 hover:text-(--ink)">Back to courses</a>
          </div>
        </div>
      </section>
    </div>
  </main>;
}

const css = `
.ui-local-error { min-height: 100dvh; display: grid; align-items: center; padding: 32px 20px; }
.ui-local-error__content { width: 100%; max-width: 44rem; min-width: 0; margin-inline: auto; }
.ui-local-error .ui-local-error__card { display: grid; gap: 24px; min-width: 0; padding: clamp(20px, 4vw, 32px); }
.ui-local-error__trace { min-width: 0; }
/* The docs' code window, flush in the card's grid; a long trace scrolls inside it */
.ui-local-error__trace .ui-cw { margin: 0; }
.ui-local-error__trace .ui-cw-code { max-height: min(48dvh, 28rem); overflow-y: auto; }
`;
