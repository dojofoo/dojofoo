import { ButtonLink } from "../components/button";
import { SitePage } from "./site";
import { questions } from "./seo";

/*
 * Dojo.foo next to another way to learn (MasterClass now; Udemy, Coursera and others later): what each gives you,
 * side by side, then the questions people ask. Dojo.foo's side is from its docs; the other's is to be confirmed from
 * its own site before the page is linked or indexed (apps/web keeps it out of search until then).
 */

/** Another way to learn: what its own site says, per aspect (unsaid: to confirm) */
export type Rival = { id: string; name: string; says: Partial<Record<string, string>> };

/** What Dojo.foo gives you, per aspect – the rival's column fills in per rival */
const dojo: Array<{ aspect: string; dojo: string }> = [
  { aspect: "Price", dojo: "Free courses. You bring your own coding agent; what its model costs is between you and its provider." },
  { aspect: "What you learn", dojo: "Coding: languages, frameworks and tools." },
  { aspect: "How you learn", dojo: "By writing the code: katas with failing tests, interactive lessons, projects and interviews." },
  { aspect: "Who teaches", dojo: "A sensei – your own coding agent, following the course's teaching notes. It hints and asks; it doesn't hand out solutions." },
  { aspect: "Feedback", dojo: "The course's tests run on your code as you go." },
  { aspect: "Where", dojo: "In your own project and editor. Your work and progress stay there as plain files you can commit." },
  { aspect: "Interviews", dojo: "Interview courses: a take-home from the team you're meeting, with a sensei." },
  { aspect: "Make your own", dojo: "Anyone can publish a course from a public GitHub repository; the marketplace lists it once it's reviewed and passes its security checks." },
];

export const rivals: Rival[] = [
  { id: "masterclass", name: "MasterClass", says: {} },
];

export function ComparePage({ rival }: { rival: Rival }) {
  return (
    <SitePage>
      <style href="ui-compare" precedence="default">{css}</style>
      <article className="ui-cmp">
        <h1>Dojo.foo vs {rival.name}</h1>
        <p className="ui-cmp__lead">How Dojo.foo's courses compare with {rival.name}'s, side by side.</p>
        <table className="ui-cmp__table">
          <thead><tr><th><span className="sr-only">Aspect</span></th><th>Dojo.foo</th><th>{rival.name}</th></tr></thead>
          <tbody>
            {dojo.map((row) => {
              const theirs = rival.says[row.aspect];
              return (
                <tr key={row.aspect}>
                  <th scope="row">{row.aspect}</th>
                  <td>{row.dojo}</td>
                  <td data-rival={rival.name} data-unconfirmed={theirs ? undefined : ""}>{theirs ?? "To confirm"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="ui-cmp__start">
          <ButtonLink href="/docs/quickstart">Start a free course</ButtonLink>
          <code>npx dojofoo</code>
        </div>
        <h2>Questions</h2>
        <dl className="ui-cmp__faq">
          {questions.filter((item) => item.status === "confirmed").map((item) => (
            <div key={item.question}><dt>{item.question}</dt><dd>{item.answer}</dd></div>
          ))}
        </dl>
      </article>
    </SitePage>
  );
}

const css = `
.ui-cmp { max-width: 56rem; margin: 0 auto; padding: 48px 0 72px; color: var(--ink); }
.ui-cmp h1 { margin: 0; font-size: 32px; font-weight: 650; line-height: 1.15; letter-spacing: -0.02em; }
.ui-cmp h2 { margin: 56px 0 16px; font-size: 20px; font-weight: 620; letter-spacing: -0.01em; }
.ui-cmp__lead { max-width: 36rem; margin: 12px 0 0; color: var(--muted); font-size: 15px; line-height: 1.55; text-wrap: pretty; }
.ui-cmp__table { width: 100%; margin-top: 32px; border-collapse: collapse; font-size: 14px; line-height: 1.55; }
.ui-cmp__table :is(th, td) { padding: 14px 16px 14px 0; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.ui-cmp__table thead th { color: var(--muted); font-size: var(--fs-caption); font-weight: 600; }
.ui-cmp__table tbody th { width: 9rem; font-weight: 600; }
.ui-cmp__table td { width: calc(50% - 4.5rem); }
.ui-cmp__table td[data-unconfirmed] { color: var(--muted); font-style: italic; }
.ui-cmp__start { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-top: 32px; }
.ui-cmp__start code { padding: 4px 8px; border-radius: calc(6px * var(--squircle-factor, 1)); background: var(--chip); font-family: var(--font-mono); font-size: 13px; }
.ui-cmp__faq { display: grid; gap: 20px; margin: 0; }
.ui-cmp__faq dt { font-size: 15px; font-weight: 600; }
.ui-cmp__faq dd { margin: 6px 0 0; color: var(--muted); font-size: 14px; line-height: 1.6; }
@media (max-width: 720px) {
  .ui-cmp { padding: 32px 20px 56px; }
  .ui-cmp__table, .ui-cmp__table tbody, .ui-cmp__table tr { display: block; }
  .ui-cmp__table thead { display: none; }
  .ui-cmp__table tr { padding: 14px 0; border-bottom: 1px solid var(--line); }
  .ui-cmp__table :is(th, td) { display: block; width: auto; padding: 0; border: 0; }
  .ui-cmp__table td { margin-top: 6px; }
  .ui-cmp__table td::before { display: block; color: var(--muted); font-size: var(--fs-caption); font-weight: 600; font-style: normal; }
  .ui-cmp__table td:nth-of-type(1)::before { content: "Dojo.foo"; }
  .ui-cmp__table td:nth-of-type(2)::before { content: attr(data-rival); }
}
`;
