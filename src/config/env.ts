import "dotenv/config";
import { z } from "zod";

const emptyAsUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const environmentSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyAsUndefined,
    z.enum(["development", "test", "production"]).default("development"),
  ),
  PORT: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(1).max(65_535).default(3000),
  ),
  INNGEST_DEV: z.preprocess(
    emptyAsUndefined,
    z
      .enum(["true", "false", "1", "0"])
      .default("false")
      .transform((value) => value === "true" || value === "1"),
  ),
  GITHUB_PRIVATE_KEY: z
    .string()
    .trim()
    .min(1, "GITHUB_PRIVATE_KEY is required")
    .transform((value) => value.replace(/\\n/g, "\n")),
  OPENAI_API_KEY: z.string().trim().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.preprocess(
    emptyAsUndefined,
    z.string().trim().min(1).default("gpt-4.1-mini"),
  ),
  GITHUB_WEBHOOK_SECRET: z
    .string()
    .trim()
    .min(1, "GITHUB_WEBHOOK_SECRET is required"),
  GITHUB_APP_ID: z.string().trim().min(1, "GITHUB_APP_ID is required"),
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
  FIX_PROPOSAL_ENCRYPTION_KEY: z.string().trim().min(16, "FIX_PROPOSAL_ENCRYPTION_KEY is required"),
  RUNNER_NODE_IMAGE: z.preprocess(
    emptyAsUndefined,
    z.string().trim().min(1).default("node:22-bookworm-slim"),
  ),
  RUNNER_BUN_IMAGE: z.preprocess(
    emptyAsUndefined,
    z.string().trim().min(1).default("oven/bun:1"),
  ),
  RUNNER_TIMEOUT_SECONDS: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(30).max(1_800).default(600),
  ),
  RUNNER_MAX_OUTPUT_BYTES: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(1_000).max(1_000_000).default(100_000),
  ),
  INNGEST_EVENT_KEY: z.preprocess(emptyAsUndefined, z.string().trim().min(1).optional()),
  INNGEST_SIGNING_KEY: z.preprocess(emptyAsUndefined, z.string().trim().min(1).optional()),
});

export type Environment = z.infer<typeof environmentSchema>;

/**
 * Validates environment variables and returns their parsed, typed values.
 * Throws a readable error at startup when configuration is missing or invalid.
 */
export function parseEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Environment {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("\n");

    throw new Error(`Invalid environment variables:\n${details}`);
  }

  return result.data;
}

export const env = parseEnvironment();
