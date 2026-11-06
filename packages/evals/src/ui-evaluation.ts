import { request } from "node:http";

/** `POST /api/authoring/evals` on a UI server, the product evaluation of a draft. It answers only when the trial and both judge panels
 *  are done, which takes longer than `fetch`'s 300-second header timeout allows, so this uses `node:http` with no timeout of its own. */
export function postEvaluation(baseUrl: string, body: { lessonIds: string[]; callId: string }, signal?: AbortSignal): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const sent = request(new URL("/api/authoring/evals", baseUrl), { method: "POST", headers: { "content-type": "application/json" }, ...(signal ? { signal } : {}) }, response => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { text += chunk; });
      response.on("end", () => {
        try { resolve({ status: response.statusCode ?? 0, body: text ? JSON.parse(text) : null }); }
        catch (error) { reject(error); }
      });
    });
    sent.on("error", reject);
    sent.end(JSON.stringify(body));
  });
}
