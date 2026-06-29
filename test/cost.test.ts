import { test } from "node:test";
import assert from "node:assert/strict";
import { costUsd } from "../src/cost.ts";

test("computes sonnet cost from usage", () => {
  const c = costUsd({ input_tokens: 1000, output_tokens: 500 }, "claude-sonnet-4-6");
  // 1000*3/1e6 + 500*15/1e6 = 0.003 + 0.0075
  assert.ok(Math.abs(c - 0.0105) < 1e-12);
});

test("computes haiku cost from usage", () => {
  const c = costUsd({ input_tokens: 2000, output_tokens: 1000 }, "claude-haiku-4-5");
  // 2000*1/1e6 + 1000*5/1e6 = 0.002 + 0.005
  assert.ok(Math.abs(c - 0.007) < 1e-12);
});

test("throws on an unknown model", () => {
  assert.throws(() => costUsd({ input_tokens: 1, output_tokens: 1 }, "gpt-4"));
});
