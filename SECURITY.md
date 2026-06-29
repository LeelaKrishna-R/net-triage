# Security

net-triage reads a file and sends its contents to the Anthropic API for diagnosis.
Treat it accordingly.

## Operating safely

- **Don't feed it live secrets.** Network logs and configs can contain passwords,
  SNMP community strings, pre-shared keys, and credentials. Sanitize input before
  diagnosing, or only run it on scrubbed captures — the contents leave your machine
  and go to the model.
- **Keep your API key in the environment.** net-triage reads `ANTHROPIC_API_KEY`
  from the environment; never commit it or paste it into config files.
- **It never connects to network devices.** net-triage is read-and-diagnose only —
  it does not SSH into, poll, or reconfigure anything. The only network call it
  makes is to the Anthropic API.

## Reporting a vulnerability

Please report security issues privately to the maintainer rather than opening a
public issue. Include reproduction steps and the affected version.
