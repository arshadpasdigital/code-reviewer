# AI Pull Request Review Agent

An MVP backend that reviews GitHub pull requests with AI, reports actionable problems, and can propose or apply focused fixes. The service is built around Express.js and TypeScript, uses Octokit.js for GitHub operations, OpenAI for code analysis, and Inngest for reliable asynchronous workflows.

## MVP status

This repository is being documented before implementation. Behavior described as **planned** is a design contract, not an existing feature.

The first release should:

1. Receive and authenticate GitHub `pull_request` webhooks.
2. Queue review work in Inngest instead of processing the webhook synchronously.
3. Read the pull request metadata, changed files, and diff through Octokit.js.
4. Ask OpenAI for structured, evidence-based findings.
5. Publish a concise review result to GitHub.
6. When explicitly enabled and safe, create a focused fix commit and report its outcome.

The initial version should prefer correctness and safe failure over broad autonomous code changes. See [PRODUCT.md](./PRODUCT.md) for the exact scope.

## Documentation map

- [PRODUCT.md](./PRODUCT.md) — MVP goals, non-goals, behavior, and acceptance criteria.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — components and end-to-end data flow.
- [WORKFLOW.md](./WORKFLOW.md) — webhook, Inngest, retry, and idempotency contracts.
- [INTEGRATIONS.md](./INTEGRATIONS.md) — GitHub and OpenAI boundaries.
- [CONFIGURATION.md](./CONFIGURATION.md) — environment and safety configuration contract.
- [SECURITY.md](./SECURITY.md) — security rules and threat boundaries.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — implementation and review workflow.
- [ROADMAP.md](./ROADMAP.md) — intentionally deferred features.
- [AGENTS.md](./AGENTS.md) — instructions for coding agents working in this repository.

## Intended stack

- Node.js with Express.js
- TypeScript
- Inngest for durable asynchronous functions, retries, and observability
- Octokit.js for GitHub App/API access
- OpenAI SDK for structured code analysis
- A persistence layer for idempotency and review state when the implementation requires it

The package manager, exact versions, runtime entry points, deployment target, and command names must be recorded here once implementation begins. Do not invent commands that are not present in `package.json`.

## Development setup

Prerequisites and local commands are **planned** until the project source and `package.json` are added.

The implementation must document:

- supported Node.js version;
- package manager and install command;
- development server command;
- type-check, lint, format, test, and build commands;
- local Inngest development server or equivalent;
- webhook forwarding method;
- required GitHub App and OpenAI setup; and
- deployment and health-check instructions.

Copy the eventual environment template before starting locally:

```text
cp .env.example .env
```

Never commit `.env` or real credentials.

## MVP request flow

```text
GitHub pull_request webhook
        |
        v
Express signature validation and event normalization
        |
        v
Inngest review event/function
        |
        +--> Octokit reads PR metadata and changed files
        |
        +--> OpenAI returns schema-validated findings and optional patch plan
        |
        +--> Octokit publishes review feedback
        |
        +--> Optional guarded fix commit
        |
        v
Stored/logged completion status
```

The webhook endpoint should acknowledge accepted work quickly. Inngest owns retries and background execution; it must not be replaced by an unbounded request handler.

## Project principles

- Treat pull-request content and model output as untrusted input.
- Keep GitHub, OpenAI, and Inngest calls behind small adapters.
- Make review runs idempotent and safe to retry.
- Do not make autonomous commits unless the configured policy explicitly allows them.
- Keep the MVP focused on actionable findings and small, verifiable fixes.
- Update the relevant documentation whenever a contract or workflow changes.
