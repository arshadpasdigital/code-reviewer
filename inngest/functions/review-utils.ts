export const MAX_PATCH_CHARS = 60_000;

export interface PullRequestChange {
  fileName: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  previousFileName?: string;
  patch?: string;
}

export function formatReviewBody(review: {
  content?: string[];
  criticalFixes?: string[];
  suggestions?: string[];
}): string {
  const sections: string[] = [];

  if (review.content?.length) {
    sections.push(review.content.join("\n\n"));
  }
  if (review.criticalFixes?.length) {
    sections.push(
      `### Critical fixes\n${review.criticalFixes.map((item) => `- ${item}`).join("\n")}`,
    );
  }
  if (review.suggestions?.length) {
    sections.push(
      `### Suggestions\n${review.suggestions.map((item) => `- ${item}`).join("\n")}`,
    );
  }

  return (
    sections.join("\n\n").trim() ||
    "Automated review completed; no additional comments were generated."
  );
}

export function boundPatches(changes: PullRequestChange[]): PullRequestChange[] {
  let remaining = MAX_PATCH_CHARS;

  return changes.map((change) => {
    if (!change.patch || remaining <= 0) {
      return { ...change, patch: undefined };
    }

    const patch = change.patch.slice(0, remaining);
    remaining -= patch.length;
    return { ...change, patch };
  });
}
