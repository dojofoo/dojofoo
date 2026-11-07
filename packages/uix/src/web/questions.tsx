import { ChevronDown } from "lucide-react";
import { Accordion } from "radix-ui";
import { cn } from "../lib/utils";
import { questions } from "./seo";

/** The questions people ask about Dojo.foo (seo.ts's confirmed ones): a heading and its line beside an accordion. The
    comparison pages end with them, the home page too; FAQPage data on the same page names the same questions. */
export function SiteQuestions({ intro, className }: { intro: string; className?: string }) {
  return (
    <section aria-labelledby="questions" className={cn("ui-faq", className)}>
      <style href="ui-faq" precedence="default">{css}</style>
      <div className="ui-faq__intro">
        <h2 id="questions">Questions</h2>
        <p>{intro}</p>
      </div>
      <Accordion.Root type="single" collapsible className="ui-faq-acc">
        {questions.filter((item) => item.status === "confirmed").map((item) => (
          <Accordion.Item key={item.question} value={item.question} className="ui-faq-acc__item">
            <Accordion.Header className="ui-faq-acc__header">
              <Accordion.Trigger className="ui-faq-acc__trigger">
                {item.question}
                <ChevronDown aria-hidden="true" />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="ui-faq-acc__content">
              <p>{item.answer}</p>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </section>
  );
}

const css = /* css */ `
/* Questions (FAQs 1): the intro beside an accordion, the open one on a card */
.ui-faq { display: grid; gap: 32px; }
@media (min-width: 768px) { .ui-faq { grid-template-columns: 2fr 3fr; gap: 48px; } }
.ui-faq__intro p { margin: 12px 0 0; color: var(--muted); font-size: 16px; line-height: 1.6; text-wrap: balance; }
.ui-faq-acc { display: grid; gap: 4px; }
.ui-faq-acc__item { border-radius: calc(14px * var(--squircle-factor, 1)); transition: background-color 200ms ease, box-shadow 200ms ease; }
.ui-faq-acc__item[data-state="open"] { background: var(--card); box-shadow: var(--shadow-3); }
.ui-faq-acc__header { display: flex; margin: 0; }
.ui-faq-acc__trigger { display: flex; flex: 1; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 16px 24px; border: 0; background: none; color: var(--ink); font: inherit; font-size: 16px; font-weight: 500; text-align: left; cursor: pointer; }
.ui-faq-acc__trigger svg { width: 16px; height: 16px; flex: none; margin-top: 4px; color: var(--muted); transition: transform 200ms ease; }
.ui-faq-acc__trigger:hover svg { transform: translateY(2px); }
.ui-faq-acc__trigger[data-state="open"] svg { transform: rotate(180deg); }
.ui-faq-acc__content { overflow: hidden; }
.ui-faq-acc__content[data-state="open"] { animation: ui-faq-acc-down 220ms cubic-bezier(.16, 1, .3, 1); }
.ui-faq-acc__content[data-state="closed"] { animation: ui-faq-acc-up 180ms ease; }
.ui-faq-acc__content p { margin: 0; padding: 0 24px 18px; color: var(--muted); font-size: 16px; line-height: 1.6; }
@keyframes ui-faq-acc-down { from { height: 0; } to { height: var(--radix-accordion-content-height); } }
@keyframes ui-faq-acc-up { from { height: var(--radix-accordion-content-height); } to { height: 0; } }
@media (prefers-reduced-motion: reduce) { .ui-faq-acc__content { animation: none !important; } }
`;
