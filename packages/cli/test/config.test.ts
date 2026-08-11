import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config";

describe("configuration defaults", () => {
  it("uses the stable Vercel registry while the custom domain DNS is unavailable", () => {
    expect(resolveConfig({}, "/tmp/dojofoo").registries).toMatchObject({
      dojofoo: "https://dojofoo.vercel.app/r/{name}.json",
    });
  });
});
