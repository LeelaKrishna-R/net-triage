import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { diagnose, DiagnoseError, DEFAULT_MODEL } from "../src/diagnose.ts";
import type { Diagnosis } from "../src/schema.ts";

const sample: Diagnosis = {
  issue_category: "mtu_mismatch",
  severity: "high",
  root_cause: "large packets dropped across the link",
  evidence: ["line 8: mtu 1500", "line 12: mtu 9000"],
  suggested_fix: "match the MTU on both interfaces",
  confidence: 0.8,
};

function fakeClient(parse: (params: unknown) => Promise<unknown>): Anthropic {
  return { messages: { parse } } as unknown as Anthropic;
}

test("returns the parsed diagnosis and usage, called with the right model/system", async () => {
  let seenModel: unknown;
  let seenSystem: unknown;
  const client = fakeClient(async (params) => {
    const p = params as { model: string; system: string };
    seenModel = p.model;
    seenSystem = p.system;
    return {
      parsed_output: sample,
      usage: { input_tokens: 10, output_tokens: 5 },
      stop_reason: "end_turn",
    };
  });

  const { diagnosis, usage } = await diagnose("R1 down to R2", { client, thinking: false });
  assert.deepEqual(diagnosis, sample);
  assert.deepEqual(usage, { input_tokens: 10, output_tokens: 5 });
  assert.equal(seenModel, DEFAULT_MODEL);
  assert.ok(typeof seenSystem === "string" && (seenSystem as string).length > 0);
});

test("retries once then throws DiagnoseError on null parsed_output", async () => {
  let calls = 0;
  const client = fakeClient(async () => {
    calls++;
    return {
      parsed_output: null,
      usage: { input_tokens: 1, output_tokens: 0 },
      stop_reason: "refusal",
    };
  });

  await assert.rejects(
    () => diagnose("garbage input", { client, thinking: false }),
    (err: unknown) => err instanceof DiagnoseError && err.stopReason === "refusal",
  );
  assert.equal(calls, 2);
});
