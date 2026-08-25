export const PULL_REQUEST_ACTIONS = [
  "opened",
  "reopened",
  "synchronize",
] as const;

export const PULL_REQUEST_REVIEW_EVENT = "github/pullrequest.review" as const;
export const PULL_REQUEST_FIX_EVENT = "github/pullrequest.fix.requested" as const;

export interface PullRequestReviewEventData {
  owner: string;
  repo: string;
  pullNumber: number;
  installationId: number;
  headSha: string;
}

export interface PullRequestFixRequestedEventData {
  checkRunId: number;
  installationId: number;
  owner: string;
  repo: string;
  pullNumber: number;
  requester: string;
}

export function isReviewablePullRequestAction(
  action: string,
): action is (typeof PULL_REQUEST_ACTIONS)[number] {
  return (PULL_REQUEST_ACTIONS as readonly string[]).includes(action);
}

export function createPullRequestReviewEvent(
  id: string,
  data: PullRequestReviewEventData,
) {
  return {
    id,
    name: PULL_REQUEST_REVIEW_EVENT,
    data,
  } as const;
}

export function createPullRequestFixRequestedEvent(id: string, data: PullRequestFixRequestedEventData) {
  return { id, name: PULL_REQUEST_FIX_EVENT, data } as const;
}
