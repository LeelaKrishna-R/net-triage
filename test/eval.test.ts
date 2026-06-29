import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { loadFixtures, runEval, type Fixture } from "../src/eval.ts";
import { ISSUE_CATEGORIES, type Diagnosis } from "../src/schema.ts";

const sample: Diagnosis = {
  issue_category: "mtu_mismatch",
  severity: "high",
  root_cause: "x",
  evidence: ["y"],
  suggested_fix: "z",
  confidence: 0.8,
};

function fakeClient(parse: (params: unknown) => Promise<unknown>): Anthropic {
  return { messages: { parse } } as unknown as Anthropic;
}

test("loadFixtures loads all six fixtures with valid categories", () => {
  const fixtures = loadFixtures("fixtures");
  assert.equal(fixtures.length, 6);
  for (const fx of fixtures) {
    assert.ok((ISSUE_CATEGORIES as readonly string[]).includes(fx.expected));
    assert.ok(fx.input.length > 0);
  }
});

test("loadFixtures rejects a fixture with an invalid category", () => {
  const dir = mkdtempSync(join(tmpdir(), "nt-fx-"));
  const bad = join(dir, "bad");
  mkdirSync(bad);
  writeFileSync(join(bad, "input.txt"), "stuff");
  writeFileSync(join(bad, "expected.json"), JSON.stringify({ issue_category: "not_a_category" }));
  assert.throws(() => loadFixtures(dir));
});

test("runEval scores accuracy and sums cost", async () => {
  const client = fakeClient(async () => ({
    parsed_output: sample,
    usage: { input_tokens: 1000, output_tokens: 1000 },
    stop_reason: "end_turn",
  }));
  const fixtures: Fixture[] = [
    { name: "a", input: "...", expected: "mtu_mismatch" },
    { name: "b", input: "...", expected: "acl_blocking_traffic" },
  ];
  const result = await runEval(fixtures, { client, thinking: false, model: "claude-sonnet-4-6" });
  assert.equal(result.correct, 1);
  assert.equal(result.total, 2);
  assert.equal(result.accuracy, 0.5);
  // each call: 1000*3/1e6 + 1000*15/1e6 = 0.018; two calls = 0.036
  assert.ok(Math.abs(result.totalCostUsd - 0.036) < 1e-9);
});
