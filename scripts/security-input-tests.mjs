import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import {
  ValidationError,
  cleanEnum,
  cleanInteger,
  cleanJsonObject,
  cleanRoomCode,
  cleanText,
  cleanUrl,
  cleanUuidArray,
  hasEncodingArtifacts,
  requireUuid,
} from "../api/_security.js";

function rejects(fn, message) {
  assert.throws(fn, ValidationError, message);
}

assert.equal(cleanText("Robert'); DROP TABLE playlists;--", { max: 80 }), "Robert'); DROP TABLE playlists;--");
assert.equal(cleanText("<script>alert(1)</script>", { max: 80 }), "<script>alert(1)</script>");
assert.equal(cleanText("Zoë 🎬 山田", { max: 80 }), "Zoë 🎬 山田");
assert.equal(cleanText("ok\u0000name", { max: 80 }), "okname");
rejects(() => cleanText("a".repeat(121), { max: 120 }), "oversized text should fail");

rejects(() => cleanUrl("javascript:alert(1)"), "javascript URL should fail");
rejects(() => cleanUrl("data:text/html,<script>alert(1)</script>"), "data URL should fail");
assert.equal(cleanUrl("https://example.com/x").startsWith("https://"), true);

const goodUuid = "00000000-0000-4000-8000-000000000000";
assert.equal(requireUuid(goodUuid), goodUuid);
rejects(() => requireUuid("not-a-uuid"), "bad uuid should fail");
assert.deepEqual(cleanUuidArray([goodUuid], { max: 1 }), [goodUuid]);
rejects(() => cleanUuidArray([goodUuid, goodUuid], { max: 1 }), "too many ids should fail");

assert.equal(cleanRoomCode("ab12"), "AB12");
rejects(() => cleanEnum("admin", ["private", "public"]), "bad enum should fail");
rejects(() => cleanInteger("999999999999", { max: 100 }), "oversized int should fail");
rejects(
  () => cleanJsonObject({ a: { b: { c: { d: "too deep" } } } }, { maxDepth: 2 }),
  "deep json should fail",
);

const mojibakeSample = String.fromCharCode(0x00c3, 0x0192, 0x00c6, 0x2019) + " bad";
assert.equal(hasEncodingArtifacts(mojibakeSample), true);
assert.equal(hasEncodingArtifacts("Clean text"), false);

function rg(pattern, args) {
  const result = spawnSync("rg", ["-n", pattern, ...args], {
    encoding: "utf8",
    shell: false,
  });
  if (result.status === 1) return "";
  if (result.status !== 0) throw new Error(result.stderr || `rg failed for ${pattern}`);
  return result.stdout;
}

const productionPaths = [
  "client/src",
  "api",
  "server",
  "shared",
  "--glob",
  "*.ts",
  "--glob",
  "*.tsx",
  "--glob",
  "*.js",
  "--glob",
  "*.json",
  "--glob",
  "!api/_security.js",
];

const xssSinks = rg(
  "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|DOMParser|srcDoc|javascript:|data:text/html",
  productionPaths,
);
assert.equal(xssSinks.trim(), "", `Unsafe HTML sink found:\n${xssSinks}`);

const mojibakePattern = [
  String.fromCharCode(0x00c3),
  String.fromCharCode(0x00c2),
  String.fromCharCode(0x00e2, 0x20ac),
  String.fromCharCode(0x00e2, 0x201e, 0x00a2),
  String.fromCharCode(0x00e2, 0x20ac, 0x0153),
  String.fromCharCode(0x00e2, 0x20ac, 0x009d),
].join("|");
const mojibake = rg(mojibakePattern, productionPaths);
assert.equal(mojibake.trim(), "", `Mojibake artifact found:\n${mojibake}`);

console.log("Security input tests passed.");
