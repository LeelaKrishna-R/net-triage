#!/usr/bin/env node
import { readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import { diagnose, DEFAULT_MODEL } from "./diagnose.ts";
import { costUsd, MODEL_PRICING } from "./cost.ts";
import { renderDiagnosis } from "./render.ts";
import { CONFIDENT, loadFixtures, runEval } from "./eval.ts";

export interface Flags {
  positionals: string[];
  model?: string;
  thinking: boolean;
  json: boolean;
  dir: string;
  minAccuracy?: number;
  // the --min-accuracy value as given when it isn't a fraction from 0 to 1 ("90", "abc", or nothing after it)
  badMinAccuracy?: string;
  only?: string[];
  list: boolean;
}

export function parseFlags(args: string[]): Flags {
  const positionals: string[] = [];
  let model: string | undefined;
  let thinking = true;
  let json = false;
  let dir = "fixtures";
  let minAccuracy: number | undefined;
  let badMinAccuracy: string | undefined;
  let only: string[] | undefined;
  let list = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--model") {
      const v = args[++i];
      if (v !== undefined) model = v;
    } else if (a === "--no-thinking") {
      thinking = false;
    } else if (a === "--json") {
      json = true;
    } else if (a === "--list") {
      list = true;
    } else if (a === "--min-accuracy") {
      const raw = args[++i];
      const v = Number(raw);
      if (raw !== undefined && raw.trim() !== "" && Number.isFinite(v) && v >= 0 && v <= 1)
        minAccuracy = v;
      else badMinAccuracy = raw ?? "";
    } else if (a === "--only") {
      const v = args[++i];
      if (v !== undefined)
        only = v
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean);
    } else if (a === "--dir") {
      const v = args[++i];
      if (v !== undefined) dir = v;
    } else {
      positionals.push(a);
    }
  }
  return { positionals, model, thinking, json, dir, minAccuracy, badMinAccuracy, only, list };
}

// "-" reads the log from stdin, so output can be piped straight in: `ssh r1 'show logging' | net-triage -`.
// With nothing piped in, "-" would wait on the terminal forever: say how to use it instead.
export function readInput(
  file: string,
  read: (f: string | number) => string = (f) => readFileSync(f, "utf8"),
  stdinIsTTY: boolean = Boolean(process.stdin.isTTY),
): string {
  if (file === "-" && stdinIsTTY)
    throw new Error(
      "'-' reads a log piped in (e.g. `ssh r1 'show logging' | net-triage -`); nothing was piped",
    );
  return read(file === "-" ? 0 : file);
}

// --only runs just the named fixtures (re-checking one failure costs one call, not sixteen). A name that isn't a
// fixture is an error, so a typo can't turn into a quiet "0/0".
export function pickFixtures<T extends { name: string }>(fixtures: T[], only?: string[]): T[] {
  if (!only) return fixtures;
  const names = new Set(fixtures.map((f) => f.name));
  const unknown = only.filter((n) => !names.has(n));
  if (unknown.length)
    throw new Error(`no fixture named ${unknown.join(", ")} (see the fixtures directory)`);
  return fixtures.filter((f) => only.includes(f.name));
}

// For CI: with --min-accuracy, an eval below the bar exits 1 so a model or prompt change can't quietly regress.
export function evalExitCode(accuracy: number, min?: number): number {
  if (min === undefined) return 0;
  if (accuracy < min) {
    console.error(
      `Accuracy ${(accuracy * 100).toFixed(0)}% is below --min-accuracy ${(min * 100).toFixed(0)}%.`,
    );
    return 1;
  }
  return 0;
}

const USAGE = [
  "usage: net-triage <file | -> [--model m] [--no-thinking] [--json]",
  "       net-triage eval [--dir fixtures] [--only a,b] [--model m] [--no-thinking] [--min-accuracy 0.9] [--json]",
  "       net-triage eval --list [--dir fixtures] [--only a,b] [--json]",
].join("\n");

// Every call is priced from MODEL_PRICING; a model with no price there used to fail only after its first paid call
// (an eval stopped one fixture in, a diagnosis printed and then exited 2), so it is refused before any call.
export function unpricedModel(model: string | undefined): string | undefined {
  if (model === undefined || model in MODEL_PRICING) return undefined;
  return `No price for model ${model}, so its cost can't be shown. Priced: ${Object.keys(MODEL_PRICING).join(", ")}.`;
}

export async function main(argv: string[], client?: Anthropic): Promise<number> {
  const flags = parseFlags(argv);
  const command = flags.positionals[0];
  const unpriced = flags.list ? undefined : unpricedModel(flags.model);
  if (unpriced) {
    console.error(unpriced);
    return 2;
  }

  if (command === "eval") {
    // A bar that didn't parse would leave the eval ungated and exit 0 after spending the calls, so CI would pass on
    // any accuracy: refuse it before any API call.
    if (flags.badMinAccuracy !== undefined) {
      console.error(
        `--min-accuracy takes a fraction from 0 to 1 (0.9 for 90%), not "${flags.badMinAccuracy}".`,
      );
      return 2;
    }
    const fixtures = pickFixtures(loadFixtures(flags.dir), flags.only);
    // --list shows what an eval would run and each label, with no API call: names to pass to --only, for free.
    if (flags.list) {
      // --json: the same list for a script (`eval --list --json | jq -r '.[].name'`)
      if (flags.json) {
        console.log(JSON.stringify(fixtures.map((f) => ({ name: f.name, expected: f.expected }))));
        return 0;
      }
      for (const f of fixtures) console.log(`${f.name}  ${f.expected}`);
      console.log(`\n${fixtures.length} fixtures`);
      return 0;
    }
    const result = await runEval(fixtures, {
      model: flags.model,
      thinking: flags.thinking,
      client,
    });
    // --json: the whole result on stdout for CI or jq (`eval --json | jq .accuracy`); --min-accuracy still sets the exit
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return evalExitCode(result.accuracy, flags.minAccuracy);
    }
    for (const c of result.cases) {
      const mark = c.correct ? "PASS" : "FAIL";
      const conf = (c.confidence * 100).toFixed(0);
      console.log(`[${mark}] ${c.name}: ${c.predicted} (exp ${c.expected}, conf ${conf}%)`);
    }
    console.log("\nBy category:");
    for (const category of Object.keys(result.byCategory).sort()) {
      const score = result.byCategory[category];
      console.log(`  ${category}: ${score.correct}/${score.total}`);
    }
    const pct = (result.accuracy * 100).toFixed(0);
    console.log(`\nAccuracy: ${result.correct}/${result.total} (${pct}%)`);
    const wrong = result.confidentlyWrong;
    console.log(
      `Confidently wrong (${(CONFIDENT * 100).toFixed(0)}%+): ${wrong.length}` +
        (wrong.length ? ` (${wrong.join(", ")})` : ""),
    );
    console.log(`Total cost: $${result.totalCostUsd.toFixed(4)}`);
    return evalExitCode(result.accuracy, flags.minAccuracy);
  }

  const file = command;
  if (!file) {
    console.error(USAGE);
    return 2;
  }
  const model = flags.model ?? DEFAULT_MODEL;
  const { diagnosis, usage } = await diagnose(readInput(file), {
    client,
    model,
    thinking: flags.thinking,
  });
  console.log(flags.json ? JSON.stringify(diagnosis, null, 2) : renderDiagnosis(diagnosis));
  // With --json, stdout carries only the JSON so `net-triage log --json | jq` parses; the cost goes to stderr.
  (flags.json ? console.error : console.log)(`\nCost: $${costUsd(usage, model).toFixed(4)}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 2;
    });
}
