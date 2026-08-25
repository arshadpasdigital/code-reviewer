import { inngest } from "../../inngest";
import { githubApp } from "../lib/github";
import {
  createPullRequestFixRequestedEvent,
  createPullRequestReviewEvent,
  isReviewablePullRequestAction,
  type PullRequestReviewEventData,
} from "./webhook-event";
import { APPLY_FIX_ACTION } from "../github/checks";

githubApp.webhooks.on("pull_request", async ({ id, payload }) => {
  if (!isReviewablePullRequestAction(payload.action)) {
    return;
  }

  const installationId =
    "installation" in payload ? payload.installation?.id : undefined;
  if (installationId === undefined) {
    throw new Error(`Pull request webhook ${id} is missing an installation ID`);
  }

  const data: PullRequestReviewEventData = {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    pullNumber: payload.number,
    installationId,
    headSha: payload.pull_request.head.sha,
  };

  console.info(
    `Received pull request #${data.pullNumber} in ${data.owner}/${data.repo}`,
  );

  await inngest.send(createPullRequestReviewEvent(id, data));
});

githubApp.webhooks.on("check_run.requested_action", async ({ id, payload }) => {
  if (payload.requested_action?.identifier !== APPLY_FIX_ACTION) return;
  const installationId = "installation" in payload ? payload.installation?.id : undefined;
  if (installationId === undefined) {
    throw new Error(`Check action webhook ${id} is missing an installation ID`);
  }
  const pullNumber = payload.check_run.pull_requests[0]?.number;
  if (pullNumber === undefined) {
    throw new Error(`Check action webhook ${id} is not associated with a pull request`);
  }
  await inngest.send(createPullRequestFixRequestedEvent(id, {
    checkRunId: payload.check_run.id,
    installationId,
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    pullNumber,
    requester: payload.sender.login,
  }));
});

githubApp.webhooks.onError((error) => {
  console.error("GitHub webhook error:", error);
});
