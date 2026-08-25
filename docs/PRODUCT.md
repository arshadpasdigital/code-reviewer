# Product Requirements

## Problem

Code review is slow when every pull request requires the same manual checks. This service should provide an automated first pass that identifies likely errors and gives the author a practical solution in the pull request.

## MVP outcome

For a supported GitHub pull request, the agent produces a review containing only actionable, evidence-based findings from the submitted diff. If a finding has a small, deterministic, and validated correction, the service may create a focused fix commit when autonomous commit mode is explicitly enabled.

The agent must not claim that code is correct merely because the model found no issue. A clean result means no supported issue was detected within the analyzed scope.

## In scope

- GitHub pull-request webhook handling.
- Review triggers for `opened`, `synchronize`, and `reopened` actions.
- Pull-request metadata, changed-file, and diff retrieval.
- Structured AI analysis of the diff and relevant context.
- Findings with file, line/range when available, severity, explanation, and solution.
- A summary comment or review on GitHub.
- Optional one-commit fixes for narrowly scoped changes.
- Retry-safe background processing through Inngest.
- Logs and status information sufficient to trace a review run.

## Out of scope for the MVP

- Full repository-wide static analysis.
- Running arbitrary pull-request code on the agent infrastructure.
- Broad refactors or multi-purpose commits.
- Automatic merging or changing branch protection.
- Unreviewed changes to secrets, workflows, permissions, or infrastructure.
- A dashboard, billing system, or multi-tenant administration UI.
- Guaranteed detection of every bug or security issue.

## Initial review policy

The agent should prioritize defects that are visible from the diff and surrounding code, such as:

- clear runtime errors;
- broken control flow or incorrect conditions;
- type/API contract mismatches;
- missing error handling at an external boundary; and
- obvious regressions introduced by the pull request.

The first version should avoid low-confidence style opinions and duplicate findings. Every finding must include evidence from the changed code or its directly relevant context.

## Finding contract

The analysis result should be normalized into a versioned structure containing:

- `id` — stable within one review run;
- `severity` — `critical`, `high`, `medium`, or `low`;
- `title` and `explanation`;
- `solution` — a concrete recommendation;
- `file` and optional changed-line range;
- `confidence`; and
- optional patch/commit instructions only when the fix is safe and sufficiently specified.

Malformed, incomplete, or low-confidence model output must not create a commit. It may be reported as an inconclusive review failure instead.

## Commit policy

Autonomous commits are opt-in and should be disabled by default during development. Before a commit is created, the workflow must verify:

1. The finding is tied to the current PR head SHA.
2. The target file and relevant lines have not changed since analysis.
3. The proposed change is limited to the finding.
4. The target is not a protected file category.
5. Repository policy allows the agent to write to the PR branch.
6. Available automated validation passes, or the result is clearly reported when validation is unavailable.

A fix commit must have a predictable author/message format and must be posted back to the PR. One review run must not create duplicate commits on retries.

## Acceptance criteria

The MVP is ready when an end-to-end test demonstrates:

- a valid webhook is accepted and an invalid signature is rejected;
- accepted work is dispatched to Inngest;
- a review run can be retried without duplicate GitHub output;
- changed files are retrieved for the exact PR head;
- OpenAI output is schema-validated;
- findings are published with useful locations and solutions; and
- autonomous commits remain impossible unless the explicit safety configuration enables them.
