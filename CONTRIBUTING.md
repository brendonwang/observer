# Contributing

Observer favors small, dependency-light features and predictable behavior.

## Development checks

Requires Node.js 20+ and Python 3.9+.

```sh
python3 build_worker.py
npm run test:build
npm test
npm run test:agent
npm pack --dry-run
```

The deployable `worker.js` is generated from `worker_source.js` and `site.html`. Commit all three together when changing the frontend or backend.

## Adding a source

Adapters return validated activity dictionaries with stable IDs, project, source, title, status and timestamps. Keep metadata-only the default and avoid uploading prompts, reasoning, tool arguments, and raw logs. New local sources should not require new Worker routes. Update agent validation, documentation, and fixture tests.

Statuses: `working`, `completed`, `failed`, `interrupted`, `quiet`, `unknown`. `interrupted` is for an aborted execution; use `failed` for completed unsuccessful jobs or unhealthy services.

## Design

Use [docs/DESIGN.md](docs/DESIGN.md) as the visual contract. Preserve the original warm canvas, typography, dividers, and quiet statuses. Do not add decorative dashboard widgets, gradients, shadows, or heavy frameworks.

## Security

Only explicitly invoked local CLI commands may execute programs. Never add browser-triggered command execution to the Worker. Validate user input at both the agent and Worker boundary. Avoid logging secrets. New external checks must be opt-in and bounded.

## Pull requests

Describe the change, migration impact, privacy implications, and tests. Breaking changes to `protocol: 1` require a documented migration and compatibility plan.
