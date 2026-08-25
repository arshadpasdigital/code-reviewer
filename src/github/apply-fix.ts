import type { Octokit } from "octokit";
import type { FixEdit } from "../persistence/fix-proposals";
import { validateFixEdits } from "../validation/safety";

export interface ApplyFixInput {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  headRef: string;
  edits: FixEdit[];
}

export async function applyFixCommit(
  octokit: Octokit,
  input: ApplyFixInput,
): Promise<{ commitSha: string }> {
  validateFixEdits(input.edits);
  const pull = await octokit.rest.pulls.get({
    owner: input.owner,
    repo: input.repo,
    pull_number: input.pullNumber,
  });
  if (pull.data.head.sha !== input.headSha) {
    throw new Error("The pull request changed after this fix was validated");
  }
  if (pull.data.head.repo?.full_name !== `${input.owner}/${input.repo}`) {
    throw new Error("Automatic fixes are disabled for fork-owned branches");
  }

  const baseCommit = await octokit.rest.repos.getCommit({ owner: input.owner, repo: input.repo, ref: input.headSha });
  const tree = [];
  for (const edit of input.edits) {
    if (edit.content === null) {
      tree.push({ path: edit.path, mode: "100644" as const, type: "blob" as const, sha: null });
      continue;
    }
    const blob = await octokit.rest.git.createBlob({
      owner: input.owner,
      repo: input.repo,
      content: edit.content,
      encoding: "utf-8",
    });
    tree.push({ path: edit.path, mode: "100644" as const, type: "blob" as const, sha: blob.data.sha });
  }
  const newTree = await octokit.rest.git.createTree({
    owner: input.owner,
    repo: input.repo,
    base_tree: baseCommit.data.commit.tree.sha,
    tree,
  });
  const commit = await octokit.rest.git.createCommit({
    owner: input.owner,
    repo: input.repo,
    message: `chore: apply validated AI fix for #${input.pullNumber}`,
    tree: newTree.data.sha,
    parents: [input.headSha],
  });
  await octokit.rest.git.updateRef({
    owner: input.owner,
    repo: input.repo,
    ref: `heads/${input.headRef.replace(/^refs\/heads\//, "")}`,
    sha: commit.data.sha,
    force: false,
  });
  return { commitSha: commit.data.sha };
}
