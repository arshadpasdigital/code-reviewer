# Contributing

## Before coding

Read [AGENTS.md](./AGENTS.md), [PRODUCT.md](./PRODUCT.md), and [ARCHITECTURE.md](./ARCHITECTURE.md). Keep changes within the MVP unless the scope is intentionally updated in [ROADMAP.md](./ROADMAP.md).

## Implementation order

Build in thin vertical slices:

1. Express health endpoint and GitHub signature validation.
2. Event normalization and Inngest dispatch.
3. Octokit read adapter and bounded diff retrieval.
4. OpenAI adapter with a versioned, schema-validated response.
5. GitHub review publication and idempotent reruns.
6. Guarded fix generation/commit behind an explicit feature setting.
7. End-to-end tests and operational documentation.

Keep provider SDK calls in adapters and keep orchestration testable without live services.

## Required checks

Before opening a pull request, run the commands defined in `package.json` for:

- formatting;
- linting;
- type checking;
- unit tests; and
- integration/end-to-end tests when the affected boundary requires them.

Do not document commands that are not actually configured. Update this file and [README.md](./README.md) when the command set is established.

## Test expectations

Changes should include relevant tests for:

- webhook signatures and event normalization;
- Inngest event payloads, retries, and idempotency;
- Octokit request mapping and rate-limit/error handling;
- OpenAI prompt/response parsing and invalid output;
- finding policy and protected paths; and
- stale-head and duplicate-commit prevention.

Live GitHub/OpenAI tests must use isolated test repositories or mocks with no production write access.

## Pull requests

A pull request should explain the behavior change, safety impact, configuration changes, test evidence, and documentation updates. Keep commits focused. Do not include credentials, copied private repository content, or generated build output.

## Adding review rules

Add a rule only when its input, output, confidence expectations, false-positive behavior, and tests are defined. Rules should produce the shared finding contract rather than directly calling GitHub. Update [PRODUCT.md](./PRODUCT.md) if the rule changes user-visible scope.

## Adding integrations

New providers must implement an adapter boundary, document credentials and permissions, define retry behavior, add contract tests, and preserve the workflow's idempotency and fail-closed guarantees.
