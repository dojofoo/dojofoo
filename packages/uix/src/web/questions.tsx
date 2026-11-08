import { ChevronDown } from "lucide-react";
import { Accordion } from "radix-ui";
import { cn } from "../lib/utils";
import { questions } from "./seo";

/** The questions people ask about Dojo.foo (seo.ts's confirmed ones): a heading and its line beside an accordion. The
    comparison pages end with them, the home page too; FAQPage data on the same page names the same questions. */
export function SiteQuestions({ intro, className }: { intro: string; className?: string }) {
  return (
    <section aria-labelledby="questions" className={cn("grid gap-8 min-[768px]:grid-cols-[2fr_3fr] min-[768px]:gap-12", className)}>
      <style href="ui-faq" precedence="default">{css}</style>
      <div className="[&_p]:mt-3 [&_p]:text-base [&_p]:leading-[1.6] [&_p]:text-balance [&_p]:text-(--muted)">
        <h2 id="questions">Questions</h2>
        <p>{intro}</p>
      </div>
      <Accordion.Root type="single" collapsible className="grid gap-1">
        {questions.filter((item) => item.status === "confirmed").map((item) => (
          <Accordion.Item data-faq-item="" key={item.question} value={item.question} className="rounded-[calc(14px*var(--squircle-factor,1))] transition-[background-color,box-shadow] duration-200 ease-[ease] data-[state=open]:bg-(--card) data-[state=open]:shadow-(--shadow-3)">
            <Accordion.Header className="m-0 flex">
              <Accordion.Trigger data-faq-trigger="" className="flex flex-1 cursor-pointer items-start justify-between gap-4 border-0 bg-transparent px-6 py-4 text-left text-base font-medium text-(--ink) [&_svg]:mt-1 [&_svg]:size-4 [&_svg]:flex-none [&_svg]:text-(--muted) [&_svg]:transition-transform [&_svg]:duration-200 [&_svg]:ease-[ease] hover:[&_svg]:translate-y-0.5 data-[state=open]:[&_svg]:translate-y-0 data-[state=open]:[&_svg]:rotate-180">
                {item.question}
                <ChevronDown aria-hidden="true" />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content forceMount data-faq-answer="" className="overflow-hidden data-[state=closed]:hidden data-[state=open]:animate-[ui-faq-acc-down_220ms_cubic-bezier(.16,1,.3,1)] motion-reduce:animate-none! [&_p]:m-0 [&_p]:px-6 [&_p]:pb-[18px] [&_p]:text-base [&_p]:leading-[1.6] [&_p]:text-(--muted)">
              <p>{item.answer}</p>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </section>
  );
}

const css = `@keyframes ui-faq-acc-down { from { height: 0; } to { height: var(--radix-accordion-content-height); } }`;
