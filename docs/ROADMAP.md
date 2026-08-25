# Roadmap

The MVP is the stable foundation for safe automated pull-request review. Future work should extend the documented contracts rather than silently expanding autonomous behavior.

## MVP

- GitHub pull-request webhook intake.
- Express.js and TypeScript service.
- Inngest-based asynchronous review workflow.
- Octokit-based PR and diff access.
- OpenAI structured analysis.
- Actionable review findings with solutions.
- Idempotent review publication.
- Explicitly controlled, focused fix commits.
- Basic logs, correlation IDs, retries, and failure states.

## Next capabilities

- Inline review comments anchored to changed lines.
- More language-aware and domain-specific checks.
- Human approval before applying a generated fix.
- Multiple small fixes with separate validation and commits.
- Review history, run dashboard, and repository configuration UI.
- Persistent feedback suppression and duplicate-finding management.
- Additional model providers and local analysis tools.
- More GitHub events and provider support.

## Deferred until the foundation is reliable

- Automatic merge or branch protection changes.
- Repository-wide autonomous refactoring.
- Arbitrary code execution from pull requests.
- Unbounded multi-file patch generation.
- Multi-tenant administration and billing.

## Extension rules

A future feature should identify its new trust boundary, state model, retry/idempotency behavior, GitHub permissions, cost impact, and test strategy before implementation. If it changes the MVP acceptance criteria, update [PRODUCT.md](./PRODUCT.md) first.
