import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import skillsList from "./fixtures/skills-list.json";

const server = setupServer(
  http.get("https://skills.sh/api/v1/skills", () => HttpResponse.json(skillsList)),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("skills.sh reference contract", () => {
  it("keeps a captured listing response as the compatibility snapshot", async () => {
    const response = await fetch("https://skills.sh/api/v1/skills?view=all-time&per_page=10");

    expect(await response.json()).toMatchSnapshot();
  });
});
