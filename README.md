# net-triage

**An AI agent that triages network logs and configs into structured, evidence-grounded diagnoses.**

Point it at a network log, device-config snippet, or packet-capture summary and it
returns a strict JSON diagnosis — issue category, severity, root cause, the exact
evidence lines, a suggested fix, and a confidence score — using Claude with the
Anthropic SDK's native structured outputs.

## The eval harness (the part that matters)

Anyone can call an LLM on a log. What makes this a real AI system is that its
diagnostic quality is **measured**, not asserted. The repo ships six labeled
fixtures (one per supported failure type) and a runner that scores how often the
agent picks the right category, printing a per-case breakdown and the total API
cost:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node src/cli.ts eval
```

On the six bundled fixtures it currently scores **6/6** (`claude-sonnet-4-6`,
~$0.08 in API cost) — reproduce it yourself with the command above:

```
[PASS] acl-block: acl_blocking_traffic (exp acl_blocking_traffic, conf 99%)
[PASS] dhcp-exhaustion: dhcp_pool_exhaustion (exp dhcp_pool_exhaustion, conf 98%)
[PASS] duplex-speed: duplex_speed_mismatch (exp duplex_speed_mismatch, conf 98%)
[PASS] mtu-mismatch: mtu_mismatch (exp mtu_mismatch, conf 98%)
[PASS] ospf-adjacency: ospf_adjacency_failure (exp ospf_adjacency_failure, conf 97%)
[PASS] vlan-trunk: vlan_trunk_misconfig (exp vlan_trunk_misconfig, conf 98%)

Accuracy: 6/6 (100%)
Total cost: $0.0770
```

These fixtures are deliberately clear-cut, so 6/6 measures that the pipeline
works — not that the problem is hard. The point is the harness: it turns "it
returns an answer" into "I can tell you how often the answer is right," and it's
the place to add messier, adversarial cases. Each fixture was independently
classified by a separate agent that never saw its intended label, so the ground
truth isn't just the author's say-so.

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

`ospf_adjacency_failure` · `vlan_trunk_misconfig` · `acl_blocking_traffic` ·
`mtu_mismatch` · `duplex_speed_mismatch` · `dhcp_pool_exhaustion`

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

More issue categories, a real pcap-summary adapter, a live read-only device-poll
mode, optional fix-application behind a confirmation gate, and cache-aware cost.

## Development

```bash
npm install
npm test         # unit tests — no API key needed (fake client)
npm run lint     # tsc --noEmit + prettier --check
```

## License

MIT — see [LICENSE](LICENSE).
