import { githubApp } from "../../src/lib/github";
import { applyFixCommit } from "../../src/github/apply-fix";
import { fixProposalRepository } from "../../src/persistence/fix-proposals";
import { finishValidationCheck, checkOutput } from "../../src/github/checks";
import { PULL_REQUEST_FIX_EVENT, type PullRequestFixRequestedEventData } from "../../src/config/webhook-event";
import { inngest } from "../index";

const allowedPermissions = new Set(["admin", "maintain", "write"]);

export const applyGithubFix = inngest.createFunction(
  { id: "apply-github-fix", triggers: [{ event: PULL_REQUEST_FIX_EVENT }] },
  async ({ event, step }) => {
    const data = event.data as PullRequestFixRequestedEventData;
    const proposal = await step.run("load-fix-proposal", () => fixProposalRepository.findByCheckRunId(data.checkRunId));
    if (!proposal || proposal.status !== "proposed") return { skipped: true, message: "Fix proposal is no longer available" };

    const octokit = await githubApp.getInstallationOctokit(data.installationId);
    const permission = await step.run("authorize-fix-request", async () => {
      try {
        const result = await octokit.rest.repos.getCollaboratorPermissionLevel({ owner: data.owner, repo: data.repo, username: data.requester });
        return (result.data as { permission?: string }).permission ?? "none";
      } catch {
        return "none";
      }
    });
    if (!allowedPermissions.has(permission)) return { skipped: true, message: "Requester is not allowed to apply fixes" };

    const pullRequest = await step.run("verify-fix-head", () => octokit.rest.pulls.get({ owner: proposal.owner, repo: proposal.repo, pull_number: proposal.pullNumber }).then((result) => ({ sha: result.data.head.sha, ref: result.data.head.ref })));
    if (pullRequest.sha !== proposal.headSha) {
      await step.run("mark-stale-proposal", () => fixProposalRepository.markStale(proposal.id));
      return { skipped: true, message: "Pull request changed; fix proposal is stale" };
    }

    const commit = await step.run("commit-validated-fix", () => applyFixCommit(octokit, {
      owner: proposal.owner,
      repo: proposal.repo,
      pullNumber: proposal.pullNumber,
      headSha: proposal.headSha,
      headRef: proposal.headRef,
      edits: proposal.edits,
    }));
    await step.run("mark-applied", () => fixProposalRepository.markApplied(proposal.id, commit.commitSha));
    await step.run("update-validation-check", () => finishValidationCheck(
      octokit,
      proposal.owner,
      proposal.repo,
      proposal.checkRunId,
      "failure",
      checkOutput("Fix applied", `Validated AI fix committed as ${commit.commitSha}. GitHub will validate the new commit.`, "", false),
    ));
    return { applied: true, commitSha: commit.commitSha };
  },
);
