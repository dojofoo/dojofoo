import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

test("the packed package preserves every pinned Eve public entry point", async () => {
  const ownUrl = import.meta.resolve("@dojofoo/agent/package.json");
  const own = JSON.parse(await readFile(new URL(ownUrl), "utf8"));
  const eve = JSON.parse(await readFile(new URL(import.meta.resolve("@dojofoo/agent/eve/package.json")), "utf8"));
  async function checkTargets(value) {
    if (typeof value === "string") {
      assert.ok(value.startsWith("./"));
      await access(new URL(value, ownUrl));
    } else if (value) {
      for (const target of Object.values(value)) await checkTargets(target);
    }
  }
  for (const key of Object.keys(eve.exports)) {
    assert.ok(Object.hasOwn(own.exports, key), `Missing Eve public entry point: ${key}`);
    await checkTargets(own.exports[key]);
    const upstream = eve.exports[key];
    // Eve also publishes type-only modules; preserve that boundary rather than
    // inventing runtime exports for them.
    if (typeof upstream === "string" || upstream.import || upstream.default) {
      assert.ok(import.meta.resolve(`@dojofoo/agent${key === "." ? "" : key.slice(1)}`));
    }
  }
});

for (const path of ["skills", "context", "hooks", "tools/bash", "tools/load_skill", "tools/todo", "tools/agent"]) {
  test(`public authoring API /${path} loads without a separate Eve install`, async () => {
    const api = await import(`@dojofoo/agent/${path}`);
    assert.ok(Object.keys(api).length > 0);
  });
}
