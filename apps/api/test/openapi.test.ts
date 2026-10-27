import { describe, expect, it } from "vitest";
import { createCoursesApp } from "../src/app";
import { readFile } from "node:fs/promises";

describe("Course API OpenAPI", () => {
  it("keeps the generated document identical before and after ordinary API traffic", async () => {
    const cold = createCoursesApp({ courses: [] });
    const before = await (await cold.handle(new Request("http://localhost/api/v1/openapi/json"))).json();
    const warm = createCoursesApp({ courses: [] });
    for (const path of [
      "/api/v1/health", "/api/v1/course-profiles", "/api/v1/marketplace", "/api/v1/courses",
      "/api/v1/courses/search?q=dojo", "/api/v1/courses/curated",
      "/api/v1/courses/missing/course/metrics", "/api/v1/courses/audit/missing/course", "/api/v1/courses/missing/course",
    ]) {
      const response = await warm.handle(new Request(`http://localhost${path}`));
      expect(response.status).toBe(path.includes("/missing/") ? 404 : 200);
    }
    expect((await warm.handle(new Request("http://localhost/api/v1/events", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }))).status).toBe(400);
    const after = await (await warm.handle(new Request("http://localhost/api/v1/openapi/json"))).json();
    expect(after).toEqual(before);
  });

  it("generates documented operations, parameters, bodies and responses from Elysia", async () => {
    const response = await createCoursesApp().handle(new Request("http://localhost/api/v1/openapi/json"));
    expect(response.status).toBe(200);
    const spec = await response.json();
    expect(spec).toEqual(JSON.parse(await readFile(new URL("../../web/content/docs/api/openapi.json", import.meta.url), "utf8")));
    expect(spec.info.title).toBe("Dojo Course API");
    const list = spec.paths["/api/v1/courses"].get;
    expect(list.operationId).toBe("listCourses");
    expect(list.parameters.map((parameter: { name: string }) => parameter.name)).toEqual(["view", "page", "per_page"]);
    expect(list.responses["200"].content["application/json"].schema).toBeDefined();
    const search = spec.paths["/api/v1/courses/search"].get;
    expect(search.parameters.find((parameter: { name: string }) => parameter.name === "q").required).toBe(true);
    expect(spec.paths["/api/v1/events"].post.requestBody.content["application/json"].schema.properties.event).toBeDefined();
    expect(spec.paths["/api/v1/events"].post.responses["202"]).toBeDefined();
    expect(spec.paths["/api/v1/courses/{source}/{slug}"].get.responses["404"]).toBeDefined();
    expect(spec.paths["/api/v1/openapi/json"]).toBeUndefined();
    expect(spec.paths["/health"]).toBeUndefined();
  });
});
