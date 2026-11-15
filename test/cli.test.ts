import { test } from "node:test";
import assert from "node:assert/strict";
import { evalExitCode, parseFlags, pickFixtures, readInput } from "../src/cli.ts";

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

test("a value flag with no following value keeps its default", () => {
  assert.equal(parseFlags(["eval", "--dir"]).dir, "fixtures");
  assert.equal(parseFlags(["log.txt", "--model"]).model, undefined);
});

test("'-' reads stdin (fd 0); anything else is a path", () => {
  const seen: Array<string | number> = [];
  const read = (f: string | number) => (seen.push(f), "log");
  readInput("-", read);
  readInput("show-log.txt", read);
  assert.deepEqual(seen, [0, "show-log.txt"]);
});

test("'-' is a positional, not a flag", () => {
  assert.deepEqual(parseFlags(["-", "--json"]).positionals, ["-"]);
});

test("--min-accuracy: parsed only as a fraction, and an eval below it exits 1", () => {
  assert.equal(parseFlags(["eval", "--min-accuracy", "0.9"]).minAccuracy, 0.9);
  assert.equal(parseFlags(["eval", "--min-accuracy", "90"]).minAccuracy, undefined);
  assert.equal(parseFlags(["eval"]).minAccuracy, undefined);
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal(evalExitCode(0.875, 0.9), 1);
  } finally {
    console.error = err;
  }
  assert.equal(evalExitCode(0.95, 0.9), 0);
  assert.equal(evalExitCode(0.5), 0);
});

test("--only runs just the named fixtures and refuses a name that isn't one", () => {
  const fx = [{ name: "a" }, { name: "b" }, { name: "c" }];
  assert.deepEqual(parseFlags(["eval", "--only", "a, c"]).only, ["a", "c"]);
  assert.deepEqual(
    pickFixtures(fx, ["c", "a"]).map((f) => f.name),
    ["a", "c"],
  );
  assert.equal(pickFixtures(fx).length, 3);
  assert.throws(() => pickFixtures(fx, ["a", "typo"]), /no fixture named typo/);
});
