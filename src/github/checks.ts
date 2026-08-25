import type { Octokit } from "octokit";

export const CHECK_NAME = "AI validation";
export const APPLY_FIX_ACTION = "apply_ai_fix";

export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "notice" | "warning" | "failure";
  message: string;
}

export function parseCheckAnnotations(output: string, max = 50): CheckAnnotation[] {
  const annotations: CheckAnnotation[] = [];
  for (const line of output.split("\n")) {
    const match = line.match(/(?:^|\s)([^\s:]+\.(?:ts|tsx|js|jsx|json)):(\d+)(?::(\d+))?/);
    if (!match) continue;
    const lineNumber = Number(match[2]);
    annotations.push({
      path: match[1]!.replace(/^.*\/workspace\//, ""),
      start_line: lineNumber,
      end_line: lineNumber,
      annotation_level: "failure",
      message: line.slice(0, 500),
    });
    if (annotations.length >= max) break;
  }
  return annotations;
}

export function checkOutput(title: string, summary: string, output: string, canApply: boolean) {
  return {
    title,
    summary,
    text: output.slice(0, 60_000),
    annotations: parseCheckAnnotations(output),
    ...(canApply
      ? { actions: [{ label: "Apply AI fix", description: "Commit the validated source fix", identifier: APPLY_FIX_ACTION }] }
      : {}),
  };
}

export async function createValidationCheck(
  octokit: Octokit,
  owner: string,
  repo: string,
  headSha: string,
) {
  return octokit.rest.checks.create({
    owner,
    repo,
    name: CHECK_NAME,
    head_sha: headSha,
    status: "in_progress",
    started_at: new Date().toISOString(),
  });
}

export async function finishValidationCheck(
  octokit: Octokit,
  owner: string,
  repo: string,
  checkRunId: number,
  conclusion: "success" | "failure" | "neutral" | "action_required",
  output: ReturnType<typeof checkOutput>,
) {
  return octokit.rest.checks.update({
    owner,
    repo,
    check_run_id: checkRunId,
    status: "completed",
    conclusion,
    completed_at: new Date().toISOString(),
    output,
  });
}
