import { test } from "node:test";
import assert from "node:assert/strict";
import { renderDiagnosis } from "../src/render.ts";
import type { Diagnosis } from "../src/schema.ts";

const d: Diagnosis = {
  issue_category: "vlan_trunk_misconfig",
  severity: "medium",
  root_cause: "access port where a trunk is expected",
  evidence: ["line 3: switchport mode access"],
  suggested_fix: "set switchport mode trunk on the uplink",
  confidence: 0.7,
};

test("renders category, severity, confidence, and evidence", () => {
  const out = renderDiagnosis(d);
  assert.match(out, /vlan_trunk_misconfig/);
  assert.match(out, /medium/);
  assert.match(out, /70%/);
  assert.match(out, /switchport mode access/);
});
