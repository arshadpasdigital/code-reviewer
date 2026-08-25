# Configuration

The exact environment-variable names must be finalized with the runtime configuration and kept in sync with `.env.example`. This document defines the contract and safe behavior before implementation.

## Configuration groups

| Group | Required values | Purpose |
| --- | --- | --- |
| Server | port, runtime environment, public/base URL if needed | Start Express and build callbacks. |
| GitHub | webhook secret, App ID/private key or supported token, installation settings | Authenticate webhook deliveries and Octokit requests. |
| Inngest | event key/signing key and environment-specific endpoint settings | Publish events and serve functions. |
| OpenAI | API key, model, request/token limits | Run bounded structured analysis. |
| Safety | commit mode, repository allowlist, protected paths, maximum diff/files | Control autonomous behavior. |
| Observability | log level and optional tracing/telemetry settings | Correlate and troubleshoot runs. |

Required values should fail fast during startup with a safe message that names the missing setting but never prints its value.

## Safe defaults

- Autonomous commit mode is disabled.
- Analysis is limited to the pull-request diff and bounded context.
- Repository allowlisting is enforced when the deployment handles more than one repository.
- Protected files include workflows, deployment configuration, dependency lockfiles, and secret-bearing files unless an explicit policy changes that decision.
- Provider retries and request sizes are bounded.
- Logs redact credentials, signatures, private keys, and unnecessary source content.

## Local development

The implementation should provide `.env.example` with empty placeholders and document:

1. how to create a GitHub App or development token;
2. how to configure the webhook URL and secret;
3. how to run Inngest locally;
4. how to forward GitHub webhooks to the local Express server; and
5. how to run in dry-run mode with no commit permissions.

Use a local secret manager or untracked `.env` file. Never put real values in Markdown, fixtures, test snapshots, logs, or commits.

## Configuration precedence

Choose one precedence order and document it in code. A reasonable order is process environment over local dotenv values over safe application defaults. Secrets must not have permissive fallback values.

## Changes

Any new setting must document its type, default, required/optional status, consuming component, security impact, and test coverage. Configuration changes that enable autonomous writes require a security review and an integration test.
