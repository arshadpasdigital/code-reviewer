# Agent Instructions

## Start here

Before changing code, read:

1. [README.md](./README.md) for the project overview and documentation map.
2. [PRODUCT.md](./PRODUCT.md) for MVP scope and acceptance criteria.
3. [ARCHITECTURE.md](./ARCHITECTURE.md) for component boundaries and data flow.
4. [WORKFLOW.md](./WORKFLOW.md) for webhook, Inngest, retry, and idempotency contracts.
5. [SECURITY.md](./SECURITY.md) before changing webhook, GitHub, model, or commit behavior.

Use the detailed integration and configuration contracts when working on providers:

- [INTEGRATIONS.md](./INTEGRATIONS.md)
- [CONFIGURATION.md](./CONFIGURATION.md)

## Project principles

- Treat pull-request content and model output as untrusted input.
- Keep GitHub, OpenAI, and Inngest SDK calls behind small adapters.
- Keep the webhook request fast; background review work belongs in Inngest.
- Make every workflow and external side effect safe to retry.
- Keep autonomous commits disabled unless an explicit safety policy enables them.
- Prefer narrow, verifiable MVP behavior over broad automation.
- Do not claim planned behavior is implemented.
- Update the relevant Markdown contract when behavior, configuration, security, or workflow changes.

## Code style

- Use descriptive variable names.
- Follow existing patterns in the codebase.
- Extract complex conditions into meaningful boolean variables.
- Do not add abstractions for hypothetical requirements.
- Keep provider-specific details out of application orchestration.

## Safety requirements

- Verify GitHub webhook signatures using the raw request body.
- Validate all model output against the shared finding contract before publishing or committing.
- Recheck the pull-request head SHA immediately before any write.
- Reject ambiguous, stale, out-of-scope, or protected-file changes.
- Never execute pull-request code during analysis.
- Never commit credentials, private keys, `.env` files, generated output, or unnecessary repository content.
- Redact secrets and sensitive source data from logs and test output.

## Validation

Before proposing a change, run the formatting, lint, type-check, test, and build commands defined in `package.json`. Do not invent commands when a script is absent. Add or update tests for webhook validation, event normalization, Inngest idempotency, provider adapters, model parsing, and commit safety as applicable.

## Documentation status

Use these terms precisely:

- **Implemented** — present in the source tree and covered by validation.
- **Planned** — defined by the documentation but not yet implemented.
- **Blocked** — intended but waiting on a dependency, decision, or external setup.

Update [CONTRIBUTING.md](./CONTRIBUTING.md) when the development workflow changes and [ROADMAP.md](./ROADMAP.md) when scope changes.
