import { afterEach, expect, it, vi } from "vitest";
import { runCoordinator } from "./coordinator";
import { runRoutes } from "./routes";

const capability = "test-learning-notes";
afterEach(() => runCoordinator.detach(capability));
const request = (token = capability) => runRoutes.request("/", {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ method: "dojo.learner.observe", params: { observation: { interpretation: "An evidenced note" } } }),
});

it("routes learning notes only through the associated active capability", async () => {
  const observe = vi.fn(async input => ({ id: "note", ...input }));
  runCoordinator.attach(capability, { ask: async () => ({}), context: () => ({}), show: fragmentId => ({ fragmentId }), observe });
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ observation: { id: "note", interpretation: "An evidenced note" } });
  expect(observe).toHaveBeenCalledWith({ interpretation: "An evidenced note" });
  expect((await request("unrelated-capability")).status).toBe(409);
  expect(observe).toHaveBeenCalledOnce();
});

it("does not expose notes in a run that has no observation handler", async () => {
  runCoordinator.attach(capability, { ask: async () => ({}), context: () => ({}), show: fragmentId => ({ fragmentId }) });
  const response = await request();
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Learning notes are unavailable in this run" });
});
