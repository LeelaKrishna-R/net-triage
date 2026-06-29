# Contributing

Thanks for your interest in net-triage.

## Setup

```bash
git clone <repo-url>
cd net-triage
npm install
```

Requires Node 24+ (the project runs off TypeScript source via Node's native type
stripping — there is no build step).

## Before opening a PR

```bash
npm test       # unit tests — no API key needed, they use a fake Anthropic client
npm run lint   # tsc --noEmit + prettier --check
```

The unit suite makes zero network calls. The eval harness (`node src/cli.ts eval`)
is the only thing that hits the real API — it needs `ANTHROPIC_API_KEY` and costs
a small amount per run, so it is intentionally separate from `npm test`.

A note on Node's strip-only type stripping: it rejects some TypeScript syntax that
`tsc` accepts (parameter properties, `enum`, `namespace`, decorators). Use plain
field declarations instead — `npm test` will catch it if you slip.

Keep changes focused and within the v0.1 scope (see the README's "what it is not"
section). Larger ideas are welcome as issues first.
