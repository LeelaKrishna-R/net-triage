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

test("prices cache reads and writes, not just plain input", () => {
  const c = costUsd(
    {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 4000,
      cache_read_input_tokens: 20000,
    },
    "claude-sonnet-4-6",
  );
  // plain 1000*3 + writes 4000*3*1.25 + reads 20000*3*0.1 + output 500*15, all /1e6
  assert.ok(Math.abs(c - (0.003 + 0.015 + 0.006 + 0.0075)) < 1e-12);
});

test("an hour-long cache write costs twice the input price", () => {
  const c = costUsd(
    {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 3000,
      cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
    },
    "claude-haiku-4-5",
  );
  // 1000*1*1.25 + 2000*1*2, /1e6
  assert.ok(Math.abs(c - (0.00125 + 0.004)) < 1e-12);
});

test("null cache fields from the API count as zero", () => {
  const c = costUsd(
    {
      input_tokens: 1000,
      output_tokens: 0,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    },
    "claude-sonnet-4-6",
  );
  assert.ok(Math.abs(c - 0.003) < 1e-12);
});
