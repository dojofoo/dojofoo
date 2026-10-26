import { describe, expect, it } from "vitest";
import { createCoursesApp } from "../src/app";
import { readFile } from "node:fs/promises";

describe("Course API OpenAPI", () => {
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
