import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("chrome extension manifest exposes the minimal context provider surface", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../chrome-extension/manifest.json", import.meta.url), "utf8")
  );

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting"]);
  assert.deepEqual(manifest.host_permissions, ["http://127.0.0.1/*"]);
  assert.equal(manifest.action.default_popup, "popup.html");
});
