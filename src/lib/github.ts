
import { App } from "@octokit/app";
import { Octokit } from "octokit";
import { env } from "../config/env";

export const githubApp = new App({
  Octokit,
  appId: env.GITHUB_APP_ID,
  privateKey: env.GITHUB_PRIVATE_KEY,
  webhooks: {
    secret: env.GITHUB_WEBHOOK_SECRET,
  },
});
