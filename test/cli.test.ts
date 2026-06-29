import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFlags } from "../src/cli.ts";

test("parses the diagnose form with flags", () => {
  const f = parseFlags(["log.txt", "--model", "claude-opus-4-8", "--json"]);
  assert.deepEqual(f.positionals, ["log.txt"]);
  assert.equal(f.model, "claude-opus-4-8");
  assert.equal(f.json, true);
  assert.equal(f.thinking, true);
});

test("parses --no-thinking and the eval form", () => {
  const f = parseFlags(["eval", "--no-thinking", "--dir", "fx"]);
  assert.deepEqual(f.positionals, ["eval"]);
  assert.equal(f.thinking, false);
  assert.equal(f.dir, "fx");
});
