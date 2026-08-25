import { lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Octokit } from "octokit";
import { validateFixEdits } from "./safety";
import type { FixEdit } from "../persistence/fix-proposals";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

export interface ValidationConfig {
  nodeImage: string;
  bunImage: string;
  timeoutSeconds: number;
  maxOutputBytes: number;
}

export interface ValidationCommand {
  name: "install" | "typecheck" | "test";
  args: string[];
  network: boolean;
}

export interface ValidationResult {
  passed: boolean;
  operationalFailure?: boolean;
  stage: "install" | "typecheck" | "test" | "complete";
  output: string;
  commands: ValidationCommand[];
}

export interface FixCandidate {
  passed: boolean;
  output: string;
  patch: string;
  edits: FixEdit[];
  validation: ValidationResult;
}

export interface ValidationWorkspace {
  directory: string;
  cleanup: () => Promise<void>;
}

export function detectPackageManager(files: string[]): PackageManager {
  const names = new Set(files);
  if (names.has("bun.lock") || names.has("bun.lockb")) return "bun";
  if (names.has("pnpm-lock.yaml")) return "pnpm";
  if (names.has("yarn.lock")) return "yarn";
  return "npm";
}

export function buildValidationCommands(
  packageManager: PackageManager,
  packageJson: { scripts?: Record<string, string>; devDependencies?: Record<string, string>; dependencies?: Record<string, string> },
  files: string[],
): ValidationCommand[] {
  const commands: ValidationCommand[] = [];
  const install = {
    bun: ["install", "--frozen-lockfile"],
    pnpm: ["install", "--frozen-lockfile"],
    yarn: ["install", files.includes(".yarnrc.yml") ? "--immutable" : "--frozen-lockfile"],
    npm: files.includes("package-lock.json") ? ["ci"] : ["install"],
  }[packageManager];
  commands.push({ name: "install", args: install, network: true });

  const scripts = packageJson.scripts ?? {};
  if (typeof scripts.typecheck === "string" && scripts.typecheck.trim()) {
    commands.push({ name: "typecheck", args: ["run", "typecheck"], network: false });
  } else if (files.includes("tsconfig.json") && (packageJson.devDependencies?.typescript || packageJson.dependencies?.typescript)) {
    const exec = packageManager === "npm" ? ["exec", "--", "tsc", "--noEmit"] : ["exec", "tsc", "--noEmit"];
    commands.push({ name: "typecheck", args: exec, network: false });
  }

  const testScript = scripts.test?.trim();
  const placeholder = !testScript || /no test specified|exit 1/i.test(testScript);
  if (!placeholder) {
    commands.push({ name: "test", args: ["run", "test"], network: false });
  }

  return commands;
}

function packageExecutable(manager: PackageManager): string {
  return manager === "bun" ? "bun" : manager;
}

function imageFor(manager: PackageManager, config: ValidationConfig): string {
  return manager === "bun" ? config.bunImage : config.nodeImage;
}

function truncate(value: string, maxBytes: number): string {
  const bytes = Buffer.byteLength(value);
  if (bytes <= maxBytes) return value;
  return `${value.slice(0, maxBytes)}\n...[output truncated]`;
}

export function sanitizeOutput(value: string): string {
  return value
    .replace(/(?:gh[pousr]_|github_pat_|sk-|AKIA)[A-Za-z0-9_\-]{12,}/g, "[REDACTED_TOKEN]")
    .replace(/(password|secret|token|api[_-]?key)\s*[=:]\s*[^\s]+/gi, "$1=[REDACTED]");
}

async function runDocker(
  workspace: string,
  manager: PackageManager,
  command: ValidationCommand,
  config: ValidationConfig,
): Promise<{ exitCode: number; output: string; timedOut: boolean }> {
  const name = `review-rabbit-${crypto.randomUUID()}`;
  const args = [
    "run", "--rm", "--name", name,
    "--user", "1000:1000",
    "--workdir", "/workspace",
    "--volume", `${workspace}:/workspace:rw`,
    "--cpus", "2", "--memory", "4g", "--pids-limit", "256",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=512m",
    "--network", command.network ? "bridge" : "none",
    "--env", "CI=true", "--env", "HOME=/tmp",
    imageFor(manager, config),
    packageExecutable(manager),
    ...command.args,
  ];
  const process = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const outputPromise = Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; process.kill(); }, config.timeoutSeconds * 1000);
  const [stdout, stderr, exitCode] = await outputPromise.finally(() => clearTimeout(timeout));
  return { exitCode, timedOut, output: truncate(sanitizeOutput(`${timedOut ? "Runner timed out or was terminated.\n" : ""}${stdout}\n${stderr}`.trim()), config.maxOutputBytes) };
}

export async function runValidation(
  workspace: string,
  manager: PackageManager,
  commands: ValidationCommand[],
  config: ValidationConfig,
): Promise<ValidationResult> {
  let output = "";
  for (const command of commands) {
    const result = await runDocker(workspace, manager, command, config);
    output += `\n$ ${packageExecutable(manager)} ${command.args.join(" ")}\n${result.output}\n`;
    if (result.timedOut) {
      return { passed: false, operationalFailure: true, stage: command.name, output: truncate(output, config.maxOutputBytes), commands };
    }
    if (result.exitCode !== 0) {
      return { passed: false, stage: command.name, output: truncate(output, config.maxOutputBytes), commands };
    }
  }
  return { passed: true, stage: "complete", output: truncate(output || "No validation commands were configured.", config.maxOutputBytes), commands };
}

export async function downloadPullRequestWorkspace(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<ValidationWorkspace> {
  const directory = join(tmpdir(), `review-rabbit-${crypto.randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const archive = join(directory, "source.tar.gz");
  const response = await octokit.rest.repos.downloadTarballArchive({ owner, repo, ref });
  await Bun.write(archive, response.data as ArrayBuffer);
  const extraction = Bun.spawn(["tar", "--no-same-owner", "--no-same-permissions", "-xzf", archive, "-C", directory]);
  if (await extraction.exited !== 0) throw new Error("Unable to extract pull request source archive");
  await rm(archive, { force: true });
  const entries = await readdir(directory, { withFileTypes: true });
  const root = entries.find((entry) => entry.isDirectory())?.name;
  if (!root) throw new Error("Pull request archive contained no source directory");
  const sourceDirectory = join(directory, root);
  const chmod = Bun.spawn(["chmod", "-R", "a+rwX", sourceDirectory]);
  await chmod.exited;
  return {
    directory: sourceDirectory,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

export async function readProjectManifest(directory: string): Promise<{ files: string[]; packageJson: Record<string, unknown> }> {
  const entries = await readdir(directory);
  const files = entries;
  const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as Record<string, unknown>;
  return { files, packageJson };
}

async function git(directory: string, args: string[]): Promise<string> {
  const process = Bun.spawn(["git", "-C", directory, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) throw new Error(`git ${args[0]} failed: ${stderr}`);
  return stdout;
}

export async function initializeBaseline(directory: string): Promise<void> {
  await git(directory, ["init"]);
  await git(directory, ["config", "user.email", "review-rabbit@localhost"]);
  await git(directory, ["config", "user.name", "Review Rabbit"]);
  await git(directory, ["add", "--all"]);
  await git(directory, ["commit", "--message", "validation baseline"]);
}

export async function readWorkspaceContext(directory: string, paths: string[], maxBytes = 120_000): Promise<Record<string, string>> {
  const candidates = [...new Set(["package.json", "tsconfig.json", ...paths])];
  const context: Record<string, string> = {};
  let remaining = maxBytes;
  for (const path of candidates) {
    if (remaining <= 0 || path.includes("..") || path.startsWith("/")) continue;
    try {
      const stat = await lstat(join(directory, path));
      if (stat.isSymbolicLink()) continue;
      const value = await readFile(join(directory, path), "utf8");
      const clipped = value.slice(0, remaining);
      context[path] = clipped;
      remaining -= Buffer.byteLength(clipped);
    } catch {
      // A deleted or binary file is not useful model context.
    }
  }
  return context;
}

export async function applyWorkspaceEdits(directory: string, edits: FixEdit[]): Promise<void> {
  validateFixEdits(edits);
  for (const edit of edits) {
    const path = join(directory, edit.path);
    if (!path.startsWith(`${directory}/`)) throw new Error(`Edit escapes workspace: ${edit.path}`);
    try {
      if ((await lstat(path)).isSymbolicLink()) throw new Error(`Edit targets a symbolic link: ${edit.path}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Edit targets")) throw error;
    }
    if (edit.content === null) {
      await rm(path, { force: true });
    } else {
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, edit.content, "utf8");
    }
  }
}

export async function collectWorkspaceEdits(directory: string, paths: string[]): Promise<FixEdit[]> {
  const edits: FixEdit[] = [];
  for (const path of [...new Set(paths)]) {
    try {
      edits.push({ path, content: await readFile(join(directory, path), "utf8") });
    } catch {
      edits.push({ path, content: null });
    }
  }
  return edits;
}

export async function getWorkspacePatch(directory: string): Promise<string> {
  return git(directory, ["diff", "--no-ext-diff", "--binary"]);
}
