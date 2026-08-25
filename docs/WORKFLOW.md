# Review Workflow

## Trigger

The primary trigger is a GitHub `pull_request` webhook for these actions:

- `opened` — start the first review;
- `synchronize` — review the new head commit; and
- `reopened` — review the current head again when policy allows.

`closed` may be consumed later for cleanup, but it should not start an analysis run in the MVP.

## Webhook contract

The Express route must:

1. read the raw request body needed for signature verification;
2. verify `X-Hub-Signature-256` with the GitHub webhook secret;
3. reject invalid or missing signatures;
4. validate the event name and minimum payload fields;
5. normalize the payload; and
6. publish an internal Inngest event before acknowledging accepted work.

The route must not perform OpenAI analysis or long-running GitHub operations in the request lifecycle.

## Internal event

The event name and exact TypeScript type are implementation decisions, but the payload must include:

```text
 deliveryId
 repository { owner, name, id }
 pullRequestNumber
 action
 baseSha
 headSha
 installationId or authentication reference
```

Do not include secrets or an unrestricted copy of the webhook body. Version the event contract if its shape changes.

## Idempotency

Use a deterministic review key based on the repository, pull-request number, action, and head SHA. The delivery ID should remain available for audit/debugging but should not be the only deduplication key because GitHub can redeliver equivalent events.

A retry must not create duplicate comments, reviews, or fix commits. Store or query an operation key before each externally visible side effect. If the PR head SHA changes, the old run must not write a fix to the new head.

## Inngest function steps

The workflow should use bounded, independently retryable steps:

1. `load-pr` — confirm the PR and current head.
2. `read-diff` — retrieve changed files and bounded context.
3. `analyze` — call OpenAI and parse the versioned response.
4. `publish-review` — create/update the GitHub review output.
5. `prepare-fix` — only when commit mode and policy allow it.
6. `commit-fix` — recheck head SHA, write the focused change, and record the commit.
7. `complete` — record outcome and metrics.

The actual function names may differ, but the boundaries and safety checks should remain visible in code.

## Retry policy

Retry transient network, provider, and rate-limit failures with bounded attempts and backoff. Do not retry invalid signatures, malformed event payloads, schema-invalid model output, permission failures, or policy rejection as if they were transient.

When a retry cannot safely repeat a side effect, query the operation key first. A workflow failure must expose a correlation ID and an actionable error category without leaking provider credentials or private source unnecessarily.

## Outcomes

Every run should end in one of these states:

- `completed` — review was published;
- `no_findings` — analysis completed without actionable findings;
- `skipped` — event or policy did not require a review;
- `blocked` — a finding exists but a safe commit was not permitted; or
- `failed` — the workflow could not complete.

A blocked autonomous fix should still explain the finding and manual solution when review publication succeeds.

## Local testing

The implementation must provide a local Inngest development workflow and a webhook forwarding method. Tests should cover signature validation, event normalization, duplicate delivery, retry behavior, head-SHA changes, and each terminal outcome.
