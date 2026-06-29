import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { diagnose, DEFAULT_MODEL } from "./diagnose.ts";
import { costUsd } from "./cost.ts";

export interface Fixture {
  name: string;
  input: string;
  expected: string;
}

export interface EvalCase {
  name: string;
  expected: string;
  predicted: string;
  confidence: number;
  correct: boolean;
  costUsd: number;
}

export interface EvalResult {
  cases: EvalCase[];
  correct: number;
  total: number;
  accuracy: number;
  totalCostUsd: number;
}

export function loadFixtures(dir: string): Fixture[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const input = readFileSync(join(dir, e.name, "input.txt"), "utf8");
      const meta = JSON.parse(readFileSync(join(dir, e.name, "expected.json"), "utf8"));
      return { name: e.name, input, expected: meta.issue_category as string };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function runEval(
  fixtures: Fixture[],
  options: { model?: string; thinking?: boolean; client?: Anthropic } = {},
): Promise<EvalResult> {
  const model = options.model ?? DEFAULT_MODEL;
  const cases: EvalCase[] = [];
  for (const fx of fixtures) {
    const { diagnosis, usage } = await diagnose(fx.input, {
      client: options.client,
      model: options.model,
      thinking: options.thinking,
    });
    cases.push({
      name: fx.name,
      expected: fx.expected,
      predicted: diagnosis.issue_category,
      confidence: diagnosis.confidence,
      correct: diagnosis.issue_category === fx.expected,
      costUsd: costUsd(usage, model),
    });
  }
  const correct = cases.filter((c) => c.correct).length;
  const total = cases.length;
  return {
    cases,
    correct,
    total,
    accuracy: total ? correct / total : 0,
    totalCostUsd: cases.reduce((s, c) => s + c.costUsd, 0),
  };
}
