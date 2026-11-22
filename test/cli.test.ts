import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { evalExitCode, main, parseFlags, pickFixtures, readInput } from "../src/cli.ts";

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

test("--json keeps stdout pure JSON: the cost line goes to stderr", async (t) => {
  const diagnosis = {
    issue_category: "mtu_mismatch",
    severity: "high",
    root_cause: "large packets dropped across the link",
    evidence: ["mtu 1500", "mtu 9000"],
    suggested_fix: "match the MTU on both interfaces",
    confidence: 0.8,
  };
  const client = {
    messages: {
      parse: async () => ({
        parsed_output: diagnosis,
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "end_turn",
      }),
    },
  } as unknown as Anthropic;
  const out: string[] = [];
  const err: string[] = [];
  t.mock.method(console, "log", (s: string) => out.push(s));
  t.mock.method(console, "error", (s: string) => err.push(s));
  const code = await main(["fixtures/mtu-mismatch/input.txt", "--json", "--no-thinking"], client);
  t.mock.restoreAll();
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(out.join("\n")), diagnosis);
  assert.match(err.join("\n"), /Cost: \$/);
});

test("eval --list prints each fixture and its label without calling the API", async (t) => {
  const out: string[] = [];
  t.mock.method(console, "log", (s: string) => out.push(s));
  const code = await main(["eval", "--list", "--only", "mtu-mismatch,acl-block"]);
  t.mock.restoreAll();
  assert.equal(code, 0);
  assert.deepEqual(out, [
    "acl-block  acl_blocking_traffic",
    "mtu-mismatch  mtu_mismatch",
    "\n2 fixtures",
  ]);
  assert.equal(parseFlags(["eval"]).list, false);
});

test("eval --json prints the whole result as JSON and keeps --min-accuracy's exit", async (t) => {
  const diagnosis = {
    issue_category: "mtu_mismatch",
    severity: "high",
    root_cause: "large packets dropped across the link",
    evidence: ["mtu 1500", "mtu 9000"],
    suggested_fix: "match the MTU on both interfaces",
    confidence: 0.9,
  };
  const client = {
    messages: {
      parse: async () => ({
        parsed_output: diagnosis,
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "end_turn",
      }),
    },
  } as unknown as Anthropic;
  const out: string[] = [];
  t.mock.method(console, "log", (s: string) => out.push(s));
  t.mock.method(console, "error", () => {});
  const ok = await main(["eval", "--json", "--only", "mtu-mismatch", "--no-thinking"], client);
  const low = await main(
    ["eval", "--json", "--only", "acl-block", "--no-thinking", "--min-accuracy", "0.9"],
    client,
  );
  t.mock.restoreAll();
  const [first, second] = out.map((s) => JSON.parse(s));
  assert.equal(ok, 0);
  assert.equal(first.accuracy, 1);
  assert.equal(first.cases[0].name, "mtu-mismatch");
  assert.equal(low, 1);
  assert.equal(second.accuracy, 0);
  assert.deepEqual(second.confidentlyWrong, ["acl-block"]);
});
