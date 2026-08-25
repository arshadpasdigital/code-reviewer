# Integrations

## GitHub

Use a GitHub App when the service needs repository installation-level access. Keep permissions at the least privilege required by the selected MVP behavior.

The initial integration should define:

- webhook URL and secret;
- subscribed `pull_request` actions;
- repository permissions for pull-request metadata, contents, and pull-request write operations only when review/commit mode requires them;
- installation authentication and token lifetime handling;
- Octokit request timeouts and rate-limit behavior; and
- the bot identity and commit attribution.

Octokit.js belongs in a GitHub adapter. Application services should request domain operations such as `getPullRequestDiff` or `publishReview`, not construct raw REST requests.

### GitHub operations by stage

| Stage | Responsibility |
| --- | --- |
| Receive | Verify delivery signature and normalize event. |
| Read | Fetch PR state, current head, changed files, and bounded file context. |
| Review | Publish a summary/comment or review with findings. |
| Fix | Recheck the head, write only an approved focused change, and create one commit. |
| Complete | Record the outcome and link to GitHub-visible results. |

The implementation must define how comments/reviews are updated on reruns so a new head does not accumulate confusing duplicates.

## OpenAI

Use the OpenAI SDK only through an application adapter. Configuration should select the model and limits; the workflow should not depend on provider-specific response objects.

The request should contain:

- the review objective;
- repository language/context when known;
- the pull-request metadata needed for scope;
- the changed diff and bounded relevant context; and
- explicit instructions to return the versioned finding contract.

The response must be schema-validated before findings are published. Reject or safely downgrade responses that contain missing locations, unsupported severities, excessive output, unknown files, or instructions unrelated to the diff.

Prompts are part of the product contract. Store prompt text/version in a stable source location, test representative outputs, and record the prompt/model version with each review result when persistence is available.

## Inngest

Inngest owns background execution, retries, step state, and run visibility. The Express process should expose the Inngest handler according to the installed SDK version, while business logic remains in testable application functions.

The event payload, function steps, retry rules, and idempotency contract are defined in [WORKFLOW.md](./WORKFLOW.md). Do not hide provider calls in route handlers or make a webhook request wait for the full review.

## Future provider boundaries

The adapter boundaries should allow later support for another Git provider, model provider, or analysis engine. Do not add those integrations to the MVP until the GitHub/OpenAI path is observable, retry-safe, and tested.
