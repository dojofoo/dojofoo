/** Who the conversation is with: the same chat, with that persona's prompts and tools. */
export const personas = ["sensei", "kyoshi"] as const;
export type Persona = (typeof personas)[number];

/** What a workspace is for; the persona follows from it and is never chosen by users. */
export const workspaceKinds = ["learner", "draft", "evaluation-trial"] as const;
export type WorkspaceKind = (typeof workspaceKinds)[number];

/** A draft runs Kyoshi; a learner workspace or an evaluation trial runs Sensei. */
export function personaForKind(kind: WorkspaceKind): Persona {
  return kind === "draft" ? "kyoshi" : "sensei";
}
