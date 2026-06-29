# net-triage — v0.1 Design Spec

- **Date:** 2026-06-29
- **Status:** Approved (design green-lit in chat)
- **Repo:** `net-triage` (own git repo; sibling of `lazarus` in the workspace)

## Summary

`net-triage` is a TypeScript CLI agent that reads a network log, device-config
snippet, or packet-capture summary from a text file and returns a **strict,
schema-validated JSON diagnosis** — issue category, severity, root cause, the
exact evidence lines, a suggested fix, and a confidence score. It uses Claude
(`claude-sonnet-4-6`) with the SDK's **native structured outputs** so the model
is constrained to a Zod schema rather than free-form JSON.

The headline feature is an **eval harness**: a set of labeled fixtures and a
runner that measures how often the agent gets the category right, printing a
per-case breakdown, overall accuracy, and total API cost. That is the difference
between "I called an LLM on a log" and "I built and *measured* an AI system."

Read-and-diagnose only — it never touches live devices.

## Goals

- Turn raw network text into a structured, **evidence-grounded** diagnosis.
- Measure diagnostic quality honestly via the eval harness (the differentiator).
- Track token cost natively from the SDK's per-response `usage` data.
- Stay trivially testable **without spending API tokens** — unit tests inject a
  fake client and never hit the network.

## Non-goals (v0.1 — binding)

Live device SSH, binary pcap parsing, web UI, multi-turn conversation, and
auto-applying fixes are all out of scope. `agent-budget` integration is deferred
(native cost tracking instead — the bare npm name is owned by a third party).

## Stack & dependencies

- **TypeScript**, **Node 24+** (native TS execution + the built-in `node --test`
  runner — no jest/vitest/tsx).
- **Runtime deps: `@anthropic-ai/sdk` + `zod`.**
- **Dev deps: `typescript`, `@types/node`, `prettier`.**
- **Lint = `tsc --noEmit` + `prettier --check`.**
- **Build:** `tsc` → `dist/`; console bin `net-triage` → `dist/cli.js`. Local dev
  runs straight off source via `node src/cli.ts` (Node 24 type-stripping).
- **Auth:** `ANTHROPIC_API_KEY` from the environment.
- **Model:** `claude-sonnet-4-6` by default; override via `--model` /
  `ANTHROPIC_MODEL`.
- **License:** MIT.

## Architecture (`src/`)

- **`schema.ts`** — the contract. `ISSUE_CATEGORIES` (the 6 enum values), a Zod
  `DiagnosisSchema`, and the inferred `Diagnosis` type.
- **`diagnose.ts`** — the agent core. A carefully engineered diagnostic system
  prompt + a single `client.messages.parse({ output_config: { format:
  zodOutputFormat(DiagnosisSchema) }, thinking: { type: "adaptive" } })` call.
  **Adaptive thinking on by default** (network diagnosis is reasoning-heavy and
  accuracy is the headline; toggle with `--no-thinking`). Returns
  `{ diagnosis, usage }`. The Anthropic **client is injectable** so tests fake
  the LLM. `parsed_output === null` (a refusal or truncation) → one retry, then
  throw `DiagnoseError` carrying the `stop_reason`.
- **`cost.ts`** — `MODEL_PRICING` ($ per 1M input/output tokens) + `costUsd(usage,
  model)`. Pure, unit-tested.
- **`render.ts`** — `renderDiagnosis(d)` → human-readable summary string. Pure.
- **`eval.ts`** — `loadFixtures(dir)` + `runEval(fixtures, deps)`: run each
  fixture through `diagnose` against the **real API**, compare predicted vs
  expected category, return results + accuracy + total cost.
- **`cli.ts`** — arg parsing. Default command `diagnose <file>`; `eval`
  subcommand. Exit codes: `0` ok · `2` usage/API error.

## Schema (the contract)

```ts
issue_category: enum [
  "ospf_adjacency_failure",
  "vlan_trunk_misconfig",
  "acl_blocking_traffic",
  "mtu_mismatch",
  "duplex_speed_mismatch",
  "dhcp_pool_exhaustion",
]
severity:    enum ["low", "medium", "high", "critical"]
root_cause:  string
evidence:    string[]   // the specific input lines that justify the diagnosis
suggested_fix: string
confidence:  number     // 0..1
```

Note: the structured-outputs JSON schema can't express numeric `minimum`/`maximum`
(an API limitation), so the SDK strips the `confidence` range before sending and
Zod re-validates it client-side. This is handled by `zodOutputFormat`.

## Diagnostic agent

- **System prompt** frames Claude as a senior network engineer and instructs it
  to: pick **exactly one** `issue_category` from the enum, ground the diagnosis
  in **exact evidence lines** from the input, and report `confidence` honestly.
- **Call:** `client.messages.parse({ model, max_tokens: 2048, thinking: {type:
  "adaptive"}, output_config: { format: zodOutputFormat(DiagnosisSchema) },
  system: DIAGNOSTIC_SYSTEM_PROMPT, messages: [{ role: "user", content: input }] })`.
- `response.parsed_output` is the validated `Diagnosis` (or `null` on
  refusal/`max_tokens`). On `null`: retry once; if still `null`, throw
  `DiagnoseError` with the `stop_reason`.
- Returns `{ diagnosis, usage: response.usage }`.
- **Fallback noted:** if `parse` + adaptive thinking ever misbehaves, drop to
  `--no-thinking` (a plain structured-output call); verified during the eval step.

## Cost tracking

`MODEL_PRICING` ($/1M tokens): `claude-sonnet-4-6` {input 3, output 15} ·
`claude-opus-4-8` {5, 25} · `claude-haiku-4-5` {1, 5}.
`costUsd(usage, model) = (usage.input_tokens × in + usage.output_tokens × out) /
1e6`. v0.1 counts input+output only; cache-aware pricing is a roadmap item (no
prompt caching is configured here).

## Eval harness (the headline)

- Fixtures live in `fixtures/<case>/` as `input.txt` + `expected.json`
  (`{ "issue_category": "..." }`).
- `runEval`: for each fixture, `diagnose(input)` → `predicted`; score
  `predicted.issue_category === expected.issue_category`; accumulate correct
  count + cost.
- Prints per-case `✓/✗` (predicted vs expected, confidence), then
  `Accuracy: X/6 (NN%)` and `Total cost: $Y`.
- **Report honestly** — a measured 4/6 with a clear writeup beats a vague "it
  works."

## Fixtures (6 labeled cases)

`ospf-adjacency` (hello/dead timer mismatch) · `vlan-trunk` (access port where a
trunk is expected / missing VLAN on trunk) · `acl-block` (ACL silently dropping
the flow) · `mtu-mismatch` (large packets failing across a link) ·
`duplex-speed` (CRC/interface errors from a half/full mismatch) ·
`dhcp-exhaustion` (clients failing to get addresses). Each `input.txt` is a
realistic device log/config snippet; `expected.json` is the ground-truth
category. Generated with care (see build plan).

## Tests (`node --test`, zero API calls)

- **`schema.test.ts`** — valid object parses; missing field / unknown category /
  `confidence > 1` rejected.
- **`cost.test.ts`** — known `usage` → expected dollars for sonnet/opus/haiku.
- **`render.test.ts`** — output contains the category, severity, and evidence.
- **`diagnose.test.ts`** — fake client whose `parse` returns a canned valid
  `Diagnosis` → `diagnose` returns it + usage, and is called with the right
  model/system; fake returning `parsed_output: null` (refusal) → retried once
  then throws `DiagnoseError`.
- The **eval harness is excluded from the unit suite** — it hits the real API,
  costs money, and is non-deterministic. Run it via `net-triage eval`.

## CLI

- `net-triage <file> [--model m] [--no-thinking] [--json]` — diagnose one file;
  prints the human summary + cost (`--json` prints the raw `Diagnosis`). Exit
  `0` / `2`.
- `net-triage eval [--dir fixtures]` — run the harness; prints accuracy + cost.

## Repo layout

```
net-triage/
  src/        schema.ts diagnose.ts cost.ts render.ts eval.ts cli.ts
  test/       schema.test.ts cost.test.ts render.test.ts diagnose.test.ts
  fixtures/   ospf-adjacency/  vlan-trunk/  acl-block/
              mtu-mismatch/  duplex-speed/  dhcp-exhaustion/   (each: input.txt + expected.json)
  docs/specs/2026-06-29-net-triage-design.md
  package.json  tsconfig.json  .gitignore  .prettierrc
  README.md  LICENSE  CONTRIBUTING.md  SECURITY.md  CLAUDE.md
```

## Build order (test-first)

1. Scaffold: `package.json` (type module, bin, scripts), `tsconfig`, `.gitignore`,
   prettier; smoke test.
2. `schema.ts` + tests.
3. `cost.ts` + tests.
4. `render.ts` + tests.
5. `diagnose.ts` (injectable client, structured outputs, retry) + fake-client tests.
6. Fixtures (6 cases) — generated carefully + an `expected.json` per case.
7. `eval.ts` + `cli.ts` (diagnose + eval commands) + a CLI smoke run.
8. README (leads with the eval harness + current accuracy) + LICENSE +
   CONTRIBUTING + SECURITY.

## Roadmap (README only — not built in v0.1)

More issue categories, a real pcap-summary adapter, a live read-only device-poll
mode, optional fix-application behind a confirmation gate, cache-aware cost, and
`agent-budget` integration once that package is sorted.
