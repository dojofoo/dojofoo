import { expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import instructions, { kyoshiInstructions, kyoshiSkills } from "./instructions";
import { parse } from "yaml";

const skillsRoot = new URL("../../skills/", import.meta.url);

// Wording is judged by live evals. These tests pin composition and the
// machine-read example, not individual sentences.
it("ships every skill file and nothing orphaned", () => {
  const onDisk = Object.fromEntries(readdirSync(skillsRoot).map(skill => [skill, readdirSync(new URL(`${skill}/`, skillsRoot)).sort()]));
  expect(onDisk).toEqual(Object.fromEntries(Object.entries(kyoshiSkills).map(([skill, files]) => [skill, [...files].sort()])));
  expect(instructions.content).toBe(`${kyoshiInstructions()}\n`);
});

it("gives every skill Agent Skills frontmatter matching its folder", () => {
  for (const skill of Object.keys(kyoshiSkills)) {
    const source = readFileSync(new URL(`${skill}/SKILL.md`, skillsRoot), "utf8");
    const frontmatter = parse(source.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? "");
    expect(frontmatter).toMatchObject({ name: skill, description: expect.stringMatching(/\bUse (?:when|after)\b/u) });
    expect(String(instructions.content)).not.toContain(`name: ${skill}\n`);
  }
});

it("names each skill in the core contract", () => {
  const core = readFileSync(new URL("../contracts/KYOSHI.md", import.meta.url), "utf8");
  for (const skill of Object.keys(kyoshiSkills)) expect(core).toContain(`**${skill}:**`);
});

it("ships a kata manifest example the CLI can actually run", () => {
  const sample = String(instructions.content).match(/```yaml\n(test: [\s\S]*?)```/u)?.[1];
  const manifest = parse(sample!);
  expect(manifest.test).toBe("npx vitest run {template}");
  expect(manifest.katas[0]).toMatchObject({ name: expect.any(String), template: expect.stringMatching(/kata\.ts$/u) });
  expect(manifest.katas[0].test).toBeUndefined();
});
