import type { Diagnosis } from "./schema.ts";

export function renderDiagnosis(d: Diagnosis): string {
  return [
    `Issue:      ${d.issue_category} (${d.severity})`,
    `Confidence: ${(d.confidence * 100).toFixed(0)}%`,
    `Root cause: ${d.root_cause}`,
    `Fix:        ${d.suggested_fix}`,
    `Evidence:`,
    ...d.evidence.map((e) => `  - ${e}`),
  ].join("\n");
}
