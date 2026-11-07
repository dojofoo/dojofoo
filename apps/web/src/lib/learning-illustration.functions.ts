import { createServerFn } from "@tanstack/react-start";
import { staticFunctionMiddleware } from "@tanstack/start-static-server-functions";

/** Cached alongside the prerendered page, never a client dependency on the learner application. */
export const loadLearningIllustration = createServerFn({ method: "GET" })
  .middleware([staticFunctionMiddleware])
  .handler(async () => {
    const { renderLearningIllustration } = await import("@dojofoo/uix/web/learning-preview");
    return renderLearningIllustration();
  });
