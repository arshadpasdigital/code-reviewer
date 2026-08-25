import { ChatOpenAI } from "@langchain/openai";
import { createAgent, providerStrategy } from "langchain";
import { z } from "zod";
import { env } from "../src/config/env";

export const githubResponseSchema = z.object({
  criticalFixes: z.array(z.string()).default([]).describe("critical fixes if any"),
  suggestions: z.array(z.string()).default([]).describe("suggestions if any"),
  content: z.array(z.string()).default([]).describe("review content"),
  event: z.enum(["APPROVE", "COMMENT", "REQUEST_CHANGES"]),
});

export const githubFixSchema = z.object({
  edits: z.array(z.object({
    path: z.string(),
    content: z.string().nullable(),
  })).default([]),
  explanation: z.string().default(""),
});

const model = new ChatOpenAI({
  apiKey: env.OPENAI_API_KEY,
  model: env.OPENAI_MODEL,
  temperature: 0,
});

export const githubPrReviewAgent = createAgent({
  model,
  systemPrompt: `
    You are an expert software engineer reviewing a GitHub pull request.
    Analyze only the supplied pull request metadata and file patches.
    Identify concrete correctness, security, reliability, and maintainability issues.
    Use APPROVE only when no changes are needed. Use REQUEST_CHANGES for critical fixes;
    otherwise use COMMENT. Keep the review actionable and concise.
  `,
  responseFormat: providerStrategy(githubResponseSchema),
});

export const githubFixAgent = createAgent({
  model,
  systemPrompt: `
    You repair JavaScript and TypeScript pull requests from compiler or test output.
    Return complete contents only for files that need edits. Never edit tests, snapshots,
    fixtures, workflows, package manifests, lockfiles, environment files, or secrets.
    Do not hide failures or weaken checks. If the failure cannot be safely fixed, return
    an empty edits array and explain why.
  `,
  responseFormat: providerStrategy(githubFixSchema),
});
