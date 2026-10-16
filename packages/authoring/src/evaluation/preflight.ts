import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse } from "yaml";
import { readPrompt } from "../prompts.ts";

/** Free, deterministic lesson checks: the "unit tests" of a lesson that run on
 * every save and before any paid trial. They catch what needs no judge: a
 * missing beat of the arc, an unfilled placeholder, a lesson too long for one
 * screen, a lesson without checks. Pedagogy stays with the judges.
 *
 * The required structure comes from the kata template itself, so the template
 * is the single source of truth: each `## Section` and each `**Label:**` whose
 * placeholder does not start with "optional" must appear in SENSEI.md.
 */
export const senseiWordBudget = 450;

export type LessonPreflight = { lessonId: string; pass: boolean; findings: string[] };

const stripCode = (text: string) => text.replace(/```[\s\S]*?```/gu, "").replace(/`[^`\n]*`/gu, "");
const words = (text: string) => text.split(/\s+/u).filter(word => /[\p{L}\p{N}]/u.test(word)).length;

export function senseiRequirements(template = readPrompt("skills/kata-lessons/SENSEI.tmpl")) {
  const sections = [...template.matchAll(/^## (.+)$/gmu)].map(match => match[1]!.trim());
  const labels = [...template.matchAll(/^- \*\*([^*{}]+):\*\* *\{([^}]*)\}/gmu)]
    .filter(match => !/^optional\b/iu.test(match[2]!.trim()))
    .map(match => match[1]!.trim());
  return { sections, labels };
}

export function checkSensei(text: string, { mdx = false, requirements = senseiRequirements() } = {}): string[] {
  const findings: string[] = [];
  const prose = stripCode(text);
  for (const section of requirements.sections) {
    if (!new RegExp(`^##\\s+${section}\\s*$`, "imu").test(text)) findings.push(`Add the "## ${section}" section from SENSEI.tmpl.`);
  }
  for (const label of requirements.labels) {
    if (!new RegExp(`\\*\\*${label}:?\\*\\*`, "iu").test(text)) findings.push(`Add the **${label}:** line from SENSEI.tmpl.`);
  }
  // MDX uses braces for expressions, so only Markdown is checked for leftovers.
  const leftovers = mdx ? [] : [...prose.matchAll(/\{[^{}\n]*\s[^{}\n]*\}/gu)].map(match => match[0]);
  if (leftovers.length) findings.push(`Replace the template placeholders: ${leftovers.slice(0, 3).join(", ")}.`);
  const count = words(text);
  if (count > senseiWordBudget) findings.push(`Cut SENSEI to one screen: ${count} words, budget ${senseiWordBudget}. Keep lesson-specific knowledge; drop scripted replies and restated policy.`);
  return findings;
}

/** A new lesson starts with `it.todo` rungs; they must become real checks. */
export function checkTests(text: string): string[] {
  if (/\b(?:it|test)\.todo\(/u.test(text)) return ["Turn the todo checks into real tests."];
  if (!/\b(?:it|test)(?:\.each\([^)]*\))?\(/u.test(text)) return ["Write the lesson's checks: the easiest win first, then one test per stumbling point."];
  return [];
}

/** Preflight the named lessons, or every lesson in `dojo.yaml`. */
export async function preflightLessons(root: string, lessonIds?: string[]): Promise<LessonPreflight[]> {
  const manifest = parse(await readFile(resolve(root, "dojo.yaml"), "utf8")) as { katas?: Array<{ name?: string; template?: string }> } | null;
  const katas = (manifest?.katas ?? []).filter(entry => entry?.name && (!lessonIds || lessonIds.includes(entry.name)));
  const requirements = senseiRequirements();
  return Promise.all(katas.map(async ({ name, template }) => {
    const findings: string[] = [];
    if (!template) return { lessonId: name!, pass: false, findings: ["Add a template path in dojo.yaml."] };
    const folder = resolve(root, dirname(template));
    const files = await readdir(folder).catch(() => [] as string[]);
    const tests = files.filter(file => /\.(test|spec)\.[cm]?[jt]sx?$/u.test(file));
    if (!tests.length) findings.push(`Add the lesson's checks (a *.test.ts) beside ${template}.`);
    else findings.push(...checkTests((await Promise.all(tests.map(file => readFile(resolve(folder, file), "utf8")))).join("\n")));
    const sensei = ["SENSEI.mdx", "SENSEI.md"].find(file => files.includes(file));
    if (!sensei) findings.push(`Fill SENSEI.tmpl into ${dirname(template)}/SENSEI.md.`);
    else findings.push(...checkSensei(await readFile(resolve(folder, sensei), "utf8"), { mdx: sensei.endsWith(".mdx"), requirements }));
    return { lessonId: name!, pass: !findings.length, findings };
  }));
}
