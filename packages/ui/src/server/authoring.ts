import { createAuthoringRoutes } from "./authoring/routes";
import { resolveRequestWorkspace } from "./control/workspace";
import { getTypeScriptHover } from "./lesson/typescript-language-service";
import { senseiEvaluationPolicy } from "@dojofoo/authoring/sensei/instructions";
import { evaluations } from "./evaluation/evaluations";
import { requestOrigin } from "./request-origin";

export const authoringRoutes = createAuthoringRoutes({
  evaluate: evaluations.run,
  // The policy a report records is Sensei's on Eve (decision 14)
  teachingPolicy: mode => senseiEvaluationPolicy(mode === "interactive" ? "interactive" : "katas"),
  resolveWorkspace: resolveRequestWorkspace,
});

authoringRoutes.post("/language/hover", async (c) => {
  const origin = c.req.header("Origin");
  if (origin && origin !== requestOrigin(c.req.raw)) return c.json({ error: "Same-origin requests only." }, 403);
  const body = await c.req.json().catch(() => null);
  if (typeof body?.code !== "string" || typeof body?.filePath !== "string" || !Number.isInteger(body?.position)) return c.json({ error: "Invalid hover request." }, 400);
  return c.json(getTypeScriptHover({ ...body, projectRoot: resolveRequestWorkspace(c.req.raw) }));
});
