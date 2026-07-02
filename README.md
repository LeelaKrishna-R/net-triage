# net-triage

[![CI](https://github.com/LeelaKrishna-R/net-triage/actions/workflows/ci.yml/badge.svg)](https://github.com/LeelaKrishna-R/net-triage/actions/workflows/ci.yml)

**An AI agent that triages network logs and configs into structured, evidence-grounded diagnoses.**

Point it at a network log, device-config snippet, or packet-capture summary and it
returns a strict JSON diagnosis — issue category, severity, root cause, the exact
evidence lines, a suggested fix, and a confidence score — using Claude with the
Anthropic SDK's native structured outputs.

## The eval harness (the part that matters)

Anyone can call an LLM on a log. What makes this a real AI system is that its
diagnostic quality is **measured**, not asserted. The repo ships **16 labeled
fixtures across 10 failure categories** (real Cisco IOS log and show-command
output) and a runner that scores how often the agent picks the right category. It
prints a per-case PASS/FAIL list, a per-category breakdown, the overall accuracy,
and the total API cost:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run eval
```

On the 16 bundled fixtures it currently scores **16/16** with `claude-sonnet-4-6`
(about $0.20 in API cost):

```
[PASS] bgp-neighbor-as-mismatch: bgp_neighbor_down (exp bgp_neighbor_down, conf 99%)
[PASS] nat-acl-mismatch: nat_translation_failure (exp nat_translation_failure, conf 97%)
[PASS] stp-loop-macflap: stp_loop (exp stp_loop, conf 97%)
... 13 more ...

By category:
  acl_blocking_traffic: 1/1
  bgp_neighbor_down: 2/2
  dhcp_pool_exhaustion: 1/1
  duplex_speed_mismatch: 2/2
  mtu_mismatch: 1/1
  nat_translation_failure: 2/2
  ospf_adjacency_failure: 1/1
  port_security_violation: 2/2
  stp_loop: 2/2
  vlan_trunk_misconfig: 2/2

Accuracy: 16/16 (100%)
Total cost: $0.1977
```

The score depends on the model, so it is meant to be reproduced rather than taken
on faith — run it with your own key. The fixtures are deliberately clear-cut: the
number measures that the pipeline classifies correctly end to end, not that the
problems are hard. That is the point of the harness — it turns "it returns an
answer" into "here is how often the answer is right," and it is where messier,
adversarial and multi-fault cases go next. Each fixture's ground-truth label lives
in its `expected.json`.

## Quick start

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...

# Diagnose one file:
node src/cli.ts fixtures/ospf-adjacency/input.txt

# Or get raw JSON:
node src/cli.ts fixtures/acl-block/input.txt --json

# Run the eval harness across all fixtures:
node src/cli.ts eval
```

Requires Node 24+ (the CLI runs straight off TypeScript source via Node's native
type stripping — no build step).

## Example

Input (an OSPF adjacency that never forms):

```
R1# show ip ospf interface GigabitEthernet0/1
  Timer intervals configured, Hello 10, Dead 40, ...
R2# show ip ospf interface GigabitEthernet0/0
  Timer intervals configured, Hello 30, Dead 120, ...
%OSPF-5-ADJCHG: ... from EXSTART to DOWN, Neighbor Down: Dead timer expired
```

Diagnosis (`--json`):

```json
{
  "issue_category": "ospf_adjacency_failure",
  "severity": "high",
  "root_cause": "OSPF hello/dead timer mismatch between R1 (10/40) and R2 (30/120) prevents the adjacency from forming.",
  "evidence": [
    "Timer intervals configured, Hello 10, Dead 40",
    "Timer intervals configured, Hello 30, Dead 120",
    "%OSPF-5-ADJCHG: ... Neighbor Down: Dead timer expired"
  ],
  "suggested_fix": "Set matching hello/dead intervals on both interfaces (e.g. hello 10 / dead 40), then confirm the adjacency reaches FULL.",
  "confidence": 0.9
}
```

## Supported issue categories

`ospf_adjacency_failure` · `bgp_neighbor_down` · `vlan_trunk_misconfig` ·
`stp_loop` · `acl_blocking_traffic` · `nat_translation_failure` · `mtu_mismatch` ·
`duplex_speed_mismatch` · `dhcp_pool_exhaustion` · `port_security_violation`

## How it works

- **Native structured outputs.** The diagnostic prompt runs through
  `messages.parse()` with a Zod schema (`zodOutputFormat`), so the model is
  constrained to the schema and the result comes back already validated — no
  hand-rolled JSON parsing or code-fence stripping.
- **Adaptive thinking** is on by default (toggle with `--no-thinking`) because
  diagnosis is reasoning-heavy and accuracy is the headline metric.
- **Native cost tracking.** Cost is computed directly from each response's token
  `usage` and a per-model price table — no extra dependency.
- **Testable without an API key.** The diagnostic agent's Anthropic client is
  injectable, so the unit suite (`npm test`) runs entirely on a fake client and
  makes zero network calls. The eval harness is the only thing that hits the API.

## What it is not

Read-and-diagnose only. It does **not** (by design, for now): connect to live
devices, parse binary pcaps, apply fixes, hold multi-turn conversations, or ship
a web UI.

## Roadmap

A real pcap-summary adapter, a live read-only device-poll mode, optional
fix-application behind a confirmation gate, cache-aware cost, and messier
multi-fault fixtures that make the eval genuinely hard.

## Development

```bash
npm install
npm test         # unit tests — no API key needed (fake client)
npm run lint     # tsc --noEmit + prettier --check
```

## License

MIT — see [LICENSE](LICENSE).
