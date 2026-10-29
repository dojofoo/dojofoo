import type { CourseFile } from "./app";

/*
 * Security checks on a course, kept per provider and per snapshot hash, in the shape skills.sh publishes its audits:
 * a status (pass, warn, fail), a risk level and a summary. Dojo's own checks run on registration, against the files
 * the registrar snapshots; Cisco's skill-scanner runs later, in scripts/audit-courses.ts. The CLI reads them before it
 * installs: a fail stops the install, a warn asks first.
 */

export type CourseAuditStatus = "pass" | "warn" | "fail";
export type CourseRiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CourseAuditProvider = "dojo" | "cisco";

export interface CourseAuditFinding {
  rule: string;
  riskLevel: CourseRiskLevel;
  message: string;
  path?: string;
  line?: number;
}

export interface CourseAudit {
  courseId: string;
  provider: CourseAuditProvider;
  /** The snapshot hash the audit looked at */
  hash: string | null;
  status: CourseAuditStatus;
  riskLevel: CourseRiskLevel;
  summary: string;
  findings: CourseAuditFinding[];
  auditedAt: string;
}

export interface CourseAuditStore {
  list(courseId: string): Promise<CourseAudit[]>;
  save(audit: CourseAudit): Promise<void>;
}

export class MemoryCourseAuditStore implements CourseAuditStore {
  readonly #audits = new Map<string, CourseAudit>();

  constructor(audits: CourseAudit[] = []) {
    for (const audit of audits) this.#audits.set(`${audit.courseId}\u0000${audit.provider}`, audit);
  }

  async list(courseId: string) {
    return [...this.#audits.values()].filter((audit) => audit.courseId === courseId);
  }

  async save(audit: CourseAudit) {
    this.#audits.set(`${audit.courseId}\u0000${audit.provider}`, audit);
  }
}

export const auditProviders: Record<CourseAuditProvider, string> = { dojo: "Dojo", cisco: "Cisco Skill Scanner" };

const riskOrder: CourseRiskLevel[] = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** The audit's verdict from its findings: HIGH or worse fails, MEDIUM warns */
export function verdict(findings: CourseAuditFinding[]): Pick<CourseAudit, "status" | "riskLevel" | "summary"> {
  const riskLevel = findings.reduce<CourseRiskLevel>(
    (worst, finding) => riskOrder.indexOf(finding.riskLevel) > riskOrder.indexOf(worst) ? finding.riskLevel : worst,
    "NONE",
  );
  const status = riskLevel === "HIGH" || riskLevel === "CRITICAL" ? "fail" : riskLevel === "MEDIUM" ? "warn" : "pass";
  if (findings.length === 0) return { status, riskLevel, summary: "No risks detected" };
  const rules = [...new Set(findings.map((finding) => finding.message))];
  const summary = `${findings.length} finding${findings.length === 1 ? "" : "s"}: ${rules.slice(0, 3).join("; ")}${rules.length > 3 ? "; …" : ""}`;
  return { status, riskLevel, summary };
}

// Dojo's checks: what installing and running a course can do to the learner's machine, and what its instructions
// can make their agent do.

// Installing a course runs code of its own: its package manager's lifecycle scripts, its prepare.sh and its mise setup
// task and hooks. Courses use these to set up, so running them is a warning; what they run is checked as text below.
const installScripts = ["preinstall", "install", "postinstall", "prepare"];
// Dependencies the registry doesn't vouch for
const unverifiableSpec = /^(?:git(?:\+[a-z]+)?:|github:|gitlab:|bitbucket:|https?:|file:|link:)|^[\w.-]+\/[\w.-]+(?:#.*)?$/iu;

interface TextRule {
  rule: string;
  riskLevel: CourseRiskLevel;
  message: string;
  pattern: RegExp;
  /** Only in these files (all text files otherwise) */
  files?: RegExp;
}

const textRules: TextRule[] = [
  {
    rule: "remote_script",
    riskLevel: "HIGH",
    message: "pipes a downloaded script into a shell",
    pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b|\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n|]*\|\s*(?:iex|Invoke-Expression)\b/iu,
  },
  {
    rule: "encoded_execution",
    riskLevel: "HIGH",
    message: "runs encoded code",
    pattern: /\b(?:eval|Function|exec)\s*\(\s*(?:atob|Buffer\.from|base64\.b64decode|bytes\.fromhex)\s*\(|base64\s+(?:-d|--decode)\b[^\n|]*\|\s*(?:ba|z)?sh\b/iu,
  },
  {
    rule: "prompt_injection",
    riskLevel: "HIGH",
    message: "tells the agent to ignore its instructions",
    pattern: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+)?(?:(?:the|your)\s+)?(?:previous|prior|above|earlier|system|original)\s+(?:instructions|prompts?|rules|guidelines)\b/iu,
    files: /\.(?:md|mdx)$/u,
  },
  {
    rule: "concealment",
    riskLevel: "MEDIUM",
    message: "asks the agent to act without the learner knowing",
    pattern: /\b(?:do\s+not|don't|never)\s+(?:tell|inform|mention\s+(?:this\s+)?to|show)\s+the\s+(?:user|learner|human)\b|\bwithout\s+(?:asking|telling|informing|notifying)\s+the\s+(?:user|learner|human)\b|\bsilently\s+(?:run|execute|send|upload|install)\b/iu,
    files: /\.(?:md|mdx)$/u,
  },
  {
    rule: "credential_access",
    riskLevel: "MEDIUM",
    message: "reads credentials on the learner's machine",
    pattern: /~\/\.ssh\b|\bid_(?:rsa|ed25519|ecdsa)\b|\.aws\/credentials\b|~\/\.(?:npmrc|netrc|docker\/config\.json|kube\/config)\b|\bsecurity\s+find-(?:generic|internet)-password\b|\/etc\/shadow\b/iu,
  },
  {
    rule: "secret",
    riskLevel: "MEDIUM",
    message: "contains what looks like a secret",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b|\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}\b/u,
  },
];

// Text that renders as nothing or out of order: bidirectional overrides (Trojan Source), Unicode tag characters and
// runs of zero-width characters (smuggled instructions). A lone zero-width space is a copy-paste artifact.
const hiddenText = /[\u202A-\u202E\u2066-\u2069]|\u{E0000}|[\u{E0020}-\u{E007F}]|[\u200B-\u200D\u2060\u180E\uFEFF]{2,}|(?<!^)\uFEFF/u;

// mise's file tasks have no extension
const textFile = /\.(?:md|mdx|txt|ya?ml|json|toml|ts|tsx|js|jsx|mjs|cjs|py|java|sh|html|css)$|^(?:mise-tasks|\.mise\/tasks|\.config\/mise\/tasks)\//u;
const lineOf = (contents: string, index: number) => contents.slice(0, index).split("\n").length;

function packageFindings(file: CourseFile): CourseAuditFinding[] {
  let manifest: { scripts?: Record<string, unknown> } & Record<string, unknown>;
  try {
    manifest = JSON.parse(file.contents) as typeof manifest;
  } catch {
    return [];
  }
  const findings: CourseAuditFinding[] = [];
  for (const script of installScripts) {
    if (typeof manifest.scripts?.[script] !== "string") continue;
    findings.push({ rule: "install_script", riskLevel: "MEDIUM", message: `runs a ${script} script on install`, path: file.path });
  }
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const dependencies = manifest[field];
    if (!dependencies || typeof dependencies !== "object") continue;
    for (const [name, spec] of Object.entries(dependencies as Record<string, unknown>)) {
      if (typeof spec !== "string" || !unverifiableSpec.test(spec)) continue;
      findings.push({ rule: "unverifiable_dependency", riskLevel: "MEDIUM", message: `installs ${name} from outside the npm registry`, path: file.path });
    }
  }
  return findings;
}

function miseFindings(file: CourseFile): CourseAuditFinding[] {
  // Hooks run on their own: entering the folder, after installing tools
  const hooks = /^[ \t]*\[hooks\]/mu.exec(file.contents);
  return hooks
    ? [{ rule: "install_script", riskLevel: "MEDIUM", message: "runs mise hooks without being asked", path: file.path, line: lineOf(file.contents, hooks.index) }]
    : [];
}

/** Dojo's checks on a course's files */
export function auditCourseFiles(files: CourseFile[] | null): CourseAuditFinding[] {
  const findings: CourseAuditFinding[] = [];
  for (const file of files ?? []) {
    if (file.path === "package.json") findings.push(...packageFindings(file));
    if (file.path === "mise.toml" || file.path === ".mise.toml") findings.push(...miseFindings(file));
    if (!textFile.test(file.path)) continue;
    const hidden = hiddenText.exec(file.contents);
    if (hidden) {
      findings.push({ rule: "hidden_text", riskLevel: "HIGH", message: "hides text with invisible or reordering characters", path: file.path, line: lineOf(file.contents, hidden.index) });
    }
    for (const rule of textRules) {
      if (rule.files && !rule.files.test(file.path)) continue;
      const match = rule.pattern.exec(file.contents);
      if (!match) continue;
      findings.push({ rule: rule.rule, riskLevel: rule.riskLevel, message: rule.message, path: file.path, line: lineOf(file.contents, match.index) });
    }
  }
  return findings;
}

// Cisco AI Defense's skill-scanner JSON: findings with a severity, CRITICAL to INFO, from its static, YARA, behavioral
// and OSV.dev (known-vulnerable dependencies) analyzers

export interface CiscoScanReport {
  findings: Array<{
    rule_id: string;
    severity: string;
    title: string;
    description?: string | null;
    file_path?: string | null;
    line_number?: number | null;
    snippet?: string | null;
  }>;
}

const ciscoRisk: Record<string, CourseRiskLevel> = { CRITICAL: "CRITICAL", HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" };

// Its eval rule (2.3.1) matches method calls too – PyTorch's model.eval() – where its exec rule doesn't: a line counts
// only when it calls eval, exec or compile itself
const callsEval = /(?<![.\w'"])(?:eval|exec|compile)\s*\(/u;

/** The scanner's findings, without its informational ones (a missing license, say) */
export function ciscoFindings(report: CiscoScanReport): CourseAuditFinding[] {
  return report.findings.flatMap((finding) => {
    const riskLevel = ciscoRisk[finding.severity];
    if (!riskLevel) return [];
    if (finding.rule_id === "COMMAND_INJECTION_EVAL" && finding.snippet && !callsEval.test(finding.snippet)) return [];
    const message = finding.description ? `${finding.title}: ${finding.description}` : finding.title;
    return [{
      rule: finding.rule_id,
      riskLevel,
      message: message.length > 280 ? `${message.slice(0, 279)}…` : message,
      ...(finding.file_path && finding.file_path !== "." ? { path: finding.file_path } : {}),
      ...(typeof finding.line_number === "number" ? { line: finding.line_number } : {}),
    }];
  });
}
