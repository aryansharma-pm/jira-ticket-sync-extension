import { readFile } from "node:fs/promises";

const manifestRaw = await readFile(new URL("../manifest.json", import.meta.url), "utf8");
const manifest = JSON.parse(manifestRaw);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(manifest.manifest_version === 3, "manifest_version must be 3 (MV3).");
assert(typeof manifest.name === "string" && manifest.name.trim(), "manifest.name is required.");
assert(manifest.background?.service_worker, "background.service_worker is required.");
assert(Array.isArray(manifest.permissions), "permissions must be an array.");
assert(Array.isArray(manifest.host_permissions), "host_permissions must be an array.");
assert(manifest.oauth2?.client_id, "oauth2.client_id is required.");

console.log("Manifest validation passed.");
