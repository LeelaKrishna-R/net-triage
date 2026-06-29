#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { diagnose, DEFAULT_MODEL } from "./diagnose.ts";
import { costUsd } from "./cost.ts";
import { renderDiagnosis } from "./render.ts";
import { loadFixtures, runEval } from "./eval.ts";

export interface Flags {
  positionals: string[];
  model?: string;
  thinking: boolean;
  json: boolean;
  dir: string;
}

export function parseFlags(args: string[]): Flags {
  const positionals: string[] = [];
  let model: string | undefined;
  let thinking = true;
  let json = false;
  let dir = "fixtures";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--model") {
      const v = args[++i];
      if (v !== undefined) model = v;
    } else if (a === "--no-thinking") {
      thinking = false;
    } else if (a === "--json") {
      json = true;
    } else if (a === "--dir") {
      const v = args[++i];
      if (v !== undefined) dir = v;
    } else {
      positionals.push(a);
    }
  }
  return { positionals, model, thinking, json, dir };
}

const USAGE = [
  "usage: net-triage <file> [--model m] [--no-thinking] [--json]",
  "       net-triage eval [--dir fixtures] [--model m] [--no-thinking]",
].join("\n");

export async function main(argv: string[]): Promise<number> {
  const flags = parseFlags(argv);
  const command = flags.positionals[0];

  if (command === "eval") {
    const result = await runEval(loadFixtures(flags.dir), {
      model: flags.model,
      thinking: flags.thinking,
    });
    for (const c of result.cases) {
      const mark = c.correct ? "PASS" : "FAIL";
      const conf = (c.confidence * 100).toFixed(0);
      console.log(`[${mark}] ${c.name}: ${c.predicted} (exp ${c.expected}, conf ${conf}%)`);
    }
    const pct = (result.accuracy * 100).toFixed(0);
    console.log(`\nAccuracy: ${result.correct}/${result.total} (${pct}%)`);
    console.log(`Total cost: $${result.totalCostUsd.toFixed(4)}`);
    return 0;
  }

  const file = command;
  if (!file) {
    console.error(USAGE);
    return 2;
  }
  const model = flags.model ?? DEFAULT_MODEL;
  const { diagnosis, usage } = await diagnose(readFileSync(file, "utf8"), {
    model,
    thinking: flags.thinking,
  });
  console.log(flags.json ? JSON.stringify(diagnosis, null, 2) : renderDiagnosis(diagnosis));
  console.log(`\nCost: $${costUsd(usage, model).toFixed(4)}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    });
}
