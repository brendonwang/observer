# Security policy

Observer is a self-hosted monitoring project. The hosted dashboard is intentionally **read-only**.

- The local agent makes outbound HTTPS requests. The Worker cannot run commands or browse local files.
- `AGENT_TOKEN`, `VIEW_PASSWORD`, and `SESSION_KEY` are independent secrets. Do not store them in source control.
- Completed responses and approved screenshot uploads must be explicitly enabled. Metadata such as thread titles and project names may be sensitive.
- Cloudflare stores received content in D1. The data is not end-to-end encrypted from the hosting provider.
- New CLI-managed deployments use a daily Cron Trigger for 30-day retention. Existing manually deployed Workers require separate configuration.
- Do not sync work environments that prohibit transmitting session metadata outside the device.

## Reporting vulnerabilities

Please do not publish credentials, reproduction logs with private session data, or exploit details in a public GitHub issue. Use GitHub's private vulnerability-reporting feature if it is enabled for this repository. Otherwise, open a minimal issue requesting a private reporting channel, without including the vulnerability details.

## Release status

This branch prepares a public beta. Cloudflare provisioning, npm publishing, per-device secrets, full browser E2E and on-device macOS upgrades still need live validation before calling it production-ready.
