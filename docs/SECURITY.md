# Security

The agent processes untrusted repository content and can potentially write to GitHub branches. Security controls are part of the MVP, not optional cleanup.

## Trust boundaries

- GitHub webhook requests are untrusted until signature verification succeeds.
- Pull-request titles, descriptions, file names, diffs, and source code are untrusted input.
- OpenAI output is untrusted until schema validation and policy checks succeed.
- GitHub write operations are privileged side effects and require explicit policy approval.

Prompt instructions found inside a pull request must never override system policy, commit restrictions, or integration instructions.

## Required controls

### Webhooks

- Verify `X-Hub-Signature-256` against the raw request body.
- Reject missing, invalid, or unsupported deliveries.
- Apply request size and timeout limits.
- Avoid logging the raw payload by default.

### GitHub access

- Prefer a GitHub App with least-privilege installation permissions.
- Separate read-only review operation from write-enabled commit operation where practical.
- Allowlist repositories and branches for autonomous writes.
- Recheck the PR head SHA immediately before any commit.
- Never modify protected files in the MVP without an explicit policy decision.

### Model and code safety

- Bound diff size, file count, context, and model output.
- Validate file paths against the PR and repository boundaries.
- Reject path traversal, unknown files, binary edits, and ambiguous patches.
- Never execute pull-request code as part of review.
- Require deterministic validation before publishing an autonomous fix.

### Secrets and logs

- Store secrets outside the repository and rotate them if exposed.
- Redact tokens, private keys, webhook signatures, authorization headers, and sensitive source content.
- Use correlation IDs instead of dumping provider payloads.
- Keep dependencies patched and run secret scanning in CI when available.

## Incident response

If a credential is exposed, revoke/rotate it first, identify affected installations, and review GitHub/Inngest/OpenAI activity. If an unsafe commit is created, disable commit mode, preserve the run correlation data, revert or correct the commit through the normal repository process, and investigate the policy failure.

Provider outages, rate limits, malformed model output, and repeated retries should fail closed: publish no autonomous commit and leave an actionable operational status.

## Security testing

Tests must cover signature verification, replay/duplicate handling, path and repository boundaries, protected files, stale head SHA detection, malformed model output, secret redaction, and commit-mode defaults.
