# Architecture

## Design goal

Keep the orchestration independent from external providers. Express accepts and authenticates requests, Inngest runs the durable workflow, adapters communicate with GitHub and OpenAI, and policy code decides what may be published or committed.

## Components

### HTTP/API layer

The Express application should expose:

- a health/readiness endpoint;
- a GitHub webhook endpoint; and
- the Inngest serve endpoint required by the chosen Inngest integration.

The webhook handler verifies the GitHub signature before parsing actionable data. It normalizes the delivery into a small internal event and sends that event to Inngest. It should return an acknowledgement without waiting for the complete review.

### Event normalization

Convert provider-specific webhook data into an internal payload containing at least:

- delivery ID;
- repository owner and name;
- pull-request number;
- pull-request action;
- base and head references/SHA values; and
- installation or authentication context needed for Octokit.

Do not pass the entire webhook body through every layer.

### Inngest workflow

The Inngest function owns the review lifecycle:

1. Deduplicate the delivery/review key.
2. Load the current pull-request state.
3. Retrieve the diff and bounded relevant context.
4. Analyze the input through the OpenAI adapter.
5. Validate and apply review policy.
6. Publish findings to GitHub.
7. Optionally produce and validate a guarded fix commit.
8. Record/log the final status.

Each external side effect should be isolated in a step that can be retried without duplicating the outcome.

### GitHub adapter

The adapter owns Octokit.js construction and GitHub API details. It should provide operations for:

- reading pull-request metadata;
- reading changed files and contents;
- publishing a comment or review;
- reading the current head SHA;
- creating a branch update/commit when policy permits; and
- adding a completion status if the product enables statuses.

The workflow should depend on application-level interfaces rather than importing Octokit throughout the codebase.

### OpenAI adapter

The adapter owns the OpenAI SDK client, model configuration, prompt version, request limits, and response parsing. It should return the versioned finding contract from [PRODUCT.md](./PRODUCT.md), not a raw provider response.

The prompt must clearly identify repository content as untrusted code/data. Model output is advisory until schema validation and commit policy checks succeed.

### Policy and safety layer

Policy decides whether a finding is publishable and whether a proposed fix can be committed. It should enforce confidence, protected-file rules, diff bounds, current-head checks, commit mode, and repository allowlists.

### State and observability

The implementation should persist a minimal review record when needed for idempotency and auditability. At minimum, log a correlation identifier, GitHub delivery ID, repository/PR, head SHA, Inngest run identifier, outcome, and error category. Never log tokens, full secrets, or unnecessary private source content.

## Dependency direction

```text
HTTP route -> event publisher -> Inngest workflow -> application services
                                             |-> GitHub adapter
                                             |-> OpenAI adapter
                                             |-> review/commit policy
                                             |-> state/observability
```

Provider clients must not become the application architecture. A future Git provider or model provider should be replaceable at the adapter boundary.

## End-to-end flow

1. GitHub sends a `pull_request` delivery.
2. Express verifies the signature and extracts the event identity.
3. The service emits an internal Inngest event.
4. Inngest starts or resumes a review run using an idempotency key.
5. Octokit reads the current PR and diff.
6. OpenAI analyzes bounded input and returns structured findings.
7. The service validates findings and publishes the review.
8. If enabled, the service rechecks the head SHA, applies a narrow fix, validates it, and creates one commit.
9. The service records success, no-findings, skipped, or failed status.

## Failure boundaries

- Invalid webhook signatures fail at the HTTP boundary.
- Provider rate limits and transient failures are retried by Inngest with bounded attempts.
- Permanent validation or policy failures produce a safe review status without a commit.
- GitHub head changes during processing invalidate the commit path; the run may publish a finding but must not write stale code.
- A failed side effect must be distinguishable from an unattempted side effect for retry safety.
