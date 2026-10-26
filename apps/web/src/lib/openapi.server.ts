import { createOpenAPI, type OpenAPIOptions } from "fumadocs-openapi/server";
import type { SchemaToPagesOptions } from "fumadocs-openapi";
import schema from "../../content/docs/api/openapi.json";

// Fumadocs upgrades Elysia's validated OpenAPI 3.1 JSON into its bundled document type.
export const openapi = createOpenAPI({ input: { course: schema } as unknown as OpenAPIOptions["input"] });

export const apiPageOptions = {
  per: "operation",
  name(entry) {
    const operation = entry.type === "operation" ? this.fromExtractedOperation(entry.item)?.operation : undefined;
    return (operation?.operationId ?? entry.info.title).replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  },
} satisfies SchemaToPagesOptions;
