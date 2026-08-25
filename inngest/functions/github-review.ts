import type { Octokit } from "octokit";
import { githubFixAgent, githubPrReviewAgent } from "../../agents/github-pr-review-agent";
import { githubApp } from "../../src/lib/github";
import {
  PULL_REQUEST_REVIEW_EVENT,
  type PullRequestReviewEventData,
} from "../../src/config/webhook-event";
import { createValidationCheck, finishValidationCheck, checkOutput } from "../../src/github/checks";
import { fixProposalRepository } from "../../src/persistence/fix-proposals";
import {
  buildValidationCommands,
  collectWorkspaceEdits,
  applyWorkspaceEdits,
  detectPackageManager,
  downloadPullRequestWorkspace,
  getWorkspacePatch,
  initializeBaseline,
  readProjectManifest,
  readWorkspaceContext,
  runValidation,
  type FixCandidate,
  type ValidationConfig,
} from "../../src/validation/runner";
import { env } from "../../src/config/env";
import { inngest } from "../index";
import { boundPatches, formatReviewBody, type PullRequestChange } from "./review-utils";

interface ValidationJobResult extends FixCandidate {
  supported: boolean;
  operational: boolean;
  initialPassed: boolean;
  stage: "install" | "typecheck" | "test" | "complete";
  attempts: number;
  commands: string[];
}

const validationConfig: ValidationConfig = {
  nodeImage: env.RUNNER_NODE_IMAGE,
  bunImage: env.RUNNER_BUN_IMAGE,
  timeoutSeconds: env.RUNNER_TIMEOUT_SECONDS,
  maxOutputBytes: env.RUNNER_MAX_OUTPUT_BYTES,
};

async function getPullRequestData(octokit: Octokit, data: PullRequestReviewEventData) {
  const response = await octokit.rest.pulls.get({
    owner: data.owner,
    repo: data.repo,
    pull_number: data.pullNumber,
  });
  return response.data;
}

async function getPullRequestChanges(octokit: Octokit, data: PullRequestReviewEventData): Promise<PullRequestChange[]> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner: data.owner,
    repo: data.repo,
    pull_number: data.pullNumber,
    per_page: 100,
  });
  return files.map((file) => ({
    fileName: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    previousFileName: file.previous_filename ?? undefined,
    patch: file.patch ?? undefined,
  }));
}

async function validateAndPrepareFix(
  octokit: Octokit,
  data: PullRequestReviewEventData,
  pullRequest: Awaited<ReturnType<typeof getPullRequestData>>,
  changes: PullRequestChange[],
): Promise<ValidationJobResult> {
  const workspace = await downloadPullRequestWorkspace(octokit, data.owner, data.repo, pullRequest.head.sha);
  try {
    const manifest = await readProjectManifest(workspace.directory).catch(() => null);
    if (!manifest) {
      return { supported: false, operational: false, initialPassed: false, passed: false, stage: "install", output: "No package.json found; JavaScript/TypeScript validation is unsupported.", patch: "", edits: [], validation: { passed: false, stage: "install", output: "unsupported", commands: [] }, attempts: 0, commands: [] };
    }
    const manager = detectPackageManager(manifest.files);
    const commands = buildValidationCommands(manager, manifest.packageJson as Parameters<typeof buildValidationCommands>[1], manifest.files);
    if (!commands.some((command) => command.name === "typecheck" || command.name === "test")) {
      return {
        supported: false,
        operational: false,
        initialPassed: false,
        passed: false,
        stage: "complete" as const,
        output: "No typecheck or test script was found; validation was not run.",
        patch: "",
        edits: [],
        validation: { passed: false, stage: "complete" as const, output: "No validation scripts", commands },
        attempts: 0,
        commands: commands.map((command) => `${command.name}: ${command.args.join(" ")}`),
      };
    }
    await initializeBaseline(workspace.directory);
    let validation = await runValidation(workspace.directory, manager, commands, validationConfig);
    const initialPassed = validation.passed;
    const changedPaths = changes.map((change) => change.fileName);
    const editedPaths: string[] = [];
    let attempts = 0;

    if (!validation.passed && !validation.operationalFailure) {
      let context = await readWorkspaceContext(workspace.directory, changedPaths);
      while (attempts < 3 && !validation.passed) {
        attempts += 1;
        const response = await githubFixAgent.invoke({
          messages: [{
            role: "user",
            content: JSON.stringify({
              attempt: attempts,
              failure: validation.output,
              files: context,
            }, null, 2),
          }],
        });
        const edits = response.structuredResponse?.edits ?? [];
        if (edits.length === 0) break;
        await applyWorkspaceEdits(workspace.directory, edits);
        changedPaths.push(...edits.map((edit) => edit.path));
        editedPaths.push(...edits.map((edit) => edit.path));
        validation = await runValidation(workspace.directory, manager, commands, validationConfig);
        context = await readWorkspaceContext(workspace.directory, changedPaths);
      }
    }

    const edits = validation.passed ? await collectWorkspaceEdits(workspace.directory, editedPaths) : [];
    const patch = validation.passed ? (await getWorkspacePatch(workspace.directory)).slice(0, 120_000) : "";
    return {
      supported: true,
      operational: Boolean(validation.operationalFailure),
      initialPassed,
      passed: validation.passed,
      stage: validation.stage,
      output: validation.output,
      patch,
      edits,
      validation,
      attempts,
      commands: commands.map((command) => `${command.name}: ${command.args.join(" ")}`),
    };
  } finally {
    await workspace.cleanup();
  }
}

export const githubRepoReview = inngest.createFunction(
  { id: "github-repo-review", triggers: [{ event: PULL_REQUEST_REVIEW_EVENT }] },
  async ({ event, step }) => {
    const data = event.data as PullRequestReviewEventData;
    const octokit = await githubApp.getInstallationOctokit(data.installationId);
    
    const pullRequest = await step.run("fetch-pull-request-information", () => getPullRequestData(octokit, data));
    if (pullRequest.state !== "open") return { skipped: true, message: "Pull request is not open" };

    const check = await step.run("start-validation-check", async () => {
      const result = await createValidationCheck(octokit, data.owner, data.repo, pullRequest.head.sha);
      return { checkRunId: result.data.id };
    });
    const changes = await step.run("fetch-pull-request-changes", () => getPullRequestChanges(octokit, data));
    if (changes.length === 0) {
      await step.run("finish-empty-validation-check", () => finishValidationCheck(octokit, data.owner, data.repo, check.checkRunId, "neutral", checkOutput("No changes", "No reviewable changes were found.", "", false)));
      return { skipped: true, message: "Pull request has no reviewable changes" };
    }

    const validation = await step.run("validate-and-prepare-fix", async () => {
      try {
        return await validateAndPrepareFix(octokit, data, pullRequest, changes);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Validation runner is unavailable";
        return {
          supported: false,
          operational: true,
          initialPassed: false,
          passed: false,
          stage: "install" as const,
          output: `Validation could not run: ${message}`,
          patch: "",
          edits: [],
          validation: { passed: false, stage: "install" as const, output: message, commands: [] },
          attempts: 0,
          commands: [],
        };
      }
    });
    const sameRepository = pullRequest.head.repo?.full_name === `${data.owner}/${data.repo}`;
    let proposalId: string | undefined;
    let persistenceUnavailable = false;
    if (validation.passed && validation.edits.length > 0 && sameRepository) {
      try {
        const proposal = await step.run("persist-fix-proposal", async () => {
          const row = await fixProposalRepository.create({
            checkRunId: check.checkRunId,
            installationId: data.installationId,
            owner: data.owner,
            repo: data.repo,
            pullNumber: data.pullNumber,
            headOwner: pullRequest.head.repo?.owner.login ?? data.owner,
            headRepo: pullRequest.head.repo?.name ?? data.repo,
            headRef: pullRequest.head.ref,
            headSha: pullRequest.head.sha,
            edits: validation.edits,
            patch: validation.patch,
            validation: validation.validation,
          });
          return { id: row.id };
        });
        proposalId = proposal.id;
      } catch {
        persistenceUnavailable = true;
      }
    }

    if (validation.passed && validation.edits.length > 0 && !sameRepository) {
      await step.run("post-fork-fix-fallback", () => octokit.rest.issues.createComment({
        owner: data.owner,
        repo: data.repo,
        issue_number: data.pullNumber,
        body: `The validated AI fix cannot be committed automatically because this pull request branch belongs to a fork.\n\nApply the following patch locally, then push it to your branch:\n\n\`\`\`diff\n${validation.patch.slice(0, 50_000)}\n\`\`\``,
      }));
    }

    await step.run("finish-validation-check", () => finishValidationCheck(
      octokit,
      data.owner,
      data.repo,
      check.checkRunId,
      !validation.supported || validation.operational || persistenceUnavailable ? "neutral" : validation.initialPassed ? "success" : "failure",
      checkOutput(
        validation.initialPassed ? "Validation passed" : "Validation failed",
        validation.initialPassed ? "Typecheck and tests passed." : `Failure during ${validation.stage}. ${proposalId ? "A validated fix is ready to apply." : "No safe validated fix is available."}`,
        validation.output,
        Boolean(proposalId),
      ),
    ));

    const review = await step.run("analyze-pull-request", async () => {
      const validationSummary = {
        supported: validation.supported,
        operational: validation.operational,
        initialPassed: validation.initialPassed,
        passed: validation.passed,
        stage: validation.stage,
        attempts: validation.attempts,
        commands: validation.commands,
        output: validation.output,
      };
      const response = await githubPrReviewAgent.invoke({
        messages: [{ role: "user", content: JSON.stringify({ pullRequest: { title: pullRequest.title, body: pullRequest.body, state: pullRequest.state, number: pullRequest.number, base: pullRequest.base.ref, head: pullRequest.head.ref, headSha: pullRequest.head.sha }, changes: boundPatches(changes), validation: validationSummary }, null, 2) }],
      });
      if (!response.structuredResponse) throw new Error("The review agent did not return a structured response");
      return response.structuredResponse;
    });
    const reviewBody = validation.initialPassed
      ? formatReviewBody(review)
      : `${formatReviewBody(review)}\n\n### Validation output\n\`\`\`text\n${validation.output.slice(0, 30_000)}\n\`\`\``;
    await step.run("submit-github-review", () => octokit.rest.pulls.createReview({
      owner: data.owner,
      repo: data.repo,
      pull_number: data.pullNumber,
      commit_id: pullRequest.head.sha,
      body: reviewBody,
      event: validation.supported && !validation.operational && !validation.initialPassed ? "REQUEST_CHANGES" : review.event,
    }));
    return { reviewed: true, validated: validation.passed, proposalId, pullNumber: data.pullNumber };
  },
);
