import { test } from "node:test";
import assert from "node:assert/strict";
import { DiagnosisSchema, ISSUE_CATEGORIES } from "../src/schema.ts";

const valid = {
  issue_category: "ospf_adjacency_failure",
  severity: "high",
  root_cause: "hello/dead timer mismatch between R1 and R2",
  evidence: ["line 14: ip ospf hello-interval 10", "line 22: ip ospf hello-interval 30"],
  suggested_fix: "align the OSPF hello/dead intervals on both interfaces",
  confidence: 0.86,
};

test("ISSUE_CATEGORIES lists ten unique categories", () => {
  assert.equal(ISSUE_CATEGORIES.length, 10);
  assert.equal(new Set(ISSUE_CATEGORIES).size, ISSUE_CATEGORIES.length);
});

test("accepts a valid diagnosis", () => {
  assert.equal(DiagnosisSchema.safeParse(valid).success, true);
});

test("rejects an unknown issue_category", () => {
  assert.equal(DiagnosisSchema.safeParse({ ...valid, issue_category: "telepathy" }).success, false);
});

test("rejects a missing field", () => {
  const { root_cause, ...rest } = valid;
  assert.equal(DiagnosisSchema.safeParse(rest).success, false);
});

test("rejects confidence above 1", () => {
  assert.equal(DiagnosisSchema.safeParse({ ...valid, confidence: 1.5 }).success, false);
});
