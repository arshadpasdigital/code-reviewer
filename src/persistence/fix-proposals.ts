import postgres, { type Sql } from "postgres";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../config/env";

export type ProposalStatus = "proposed" | "applied" | "stale" | "expired";

export interface FixEdit {
  path: string;
  content: string | null;
}

export interface FixProposal {
  id: string;
  checkRunId: number;
  installationId: number;
  owner: string;
  repo: string;
  pullNumber: number;
  headOwner: string;
  headRepo: string;
  headRef: string;
  headSha: string;
  edits: FixEdit[];
  patch: string;
  validation: Record<string, unknown>;
  status: ProposalStatus;
}

export type ProposalStore = Pick<FixProposalRepository, "create" | "findByCheckRunId" | "markApplied" | "markStale">;

const encryptionKey = createHash("sha256").update(env.FIX_PROPOSAL_ENCRYPTION_KEY).digest();

function encrypt(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

function decrypt<T>(value: string): T {
  const [ivValue, tagValue, ciphertextValue] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(ivValue!, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue!, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextValue!, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

function mapProposal(row: Record<string, any>): FixProposal {
  return {
    id: row.id,
    checkRunId: Number(row.check_run_id),
    installationId: Number(row.installation_id),
    owner: row.owner,
    repo: row.repo,
    pullNumber: Number(row.pull_number),
    headOwner: row.head_owner,
    headRepo: row.head_repo,
    headRef: row.head_ref,
    headSha: row.head_sha,
    edits: decrypt<FixEdit[]>(row.edits),
    patch: decrypt<string>(row.patch),
    validation: decrypt<Record<string, unknown>>(row.validation),
    status: row.status,
  };
}

export class FixProposalRepository {
  constructor(private readonly sql: Sql) {}

  async create(input: Omit<FixProposal, "id" | "status">): Promise<FixProposal> {
    const [row] = await this.sql<FixProposal[]>`
      INSERT INTO fix_proposals
        (check_run_id, installation_id, owner, repo, pull_number, head_owner, head_repo,
         head_ref, head_sha, edits, patch, validation, status)
      VALUES
        (${input.checkRunId}, ${input.installationId}, ${input.owner}, ${input.repo},
         ${input.pullNumber}, ${input.headOwner}, ${input.headRepo}, ${input.headRef},
         ${input.headSha}, ${this.sql.json(encrypt(input.edits) as never)}, ${encrypt(input.patch)},
         ${this.sql.json(encrypt(input.validation) as never)}, 'proposed')
      RETURNING *
    `;
    if (!row) throw new Error("Unable to persist fix proposal");
    return mapProposal(row as Record<string, any>);
  }

  async findByCheckRunId(checkRunId: number): Promise<FixProposal | null> {
    const [row] = await this.sql<FixProposal[]>`
      SELECT * FROM fix_proposals WHERE check_run_id = ${checkRunId}
        AND status = 'proposed' AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1
    `;
    return row ? mapProposal(row as Record<string, any>) : null;
  }

  async markApplied(id: string, commitSha: string): Promise<void> {
    await this.sql`
      UPDATE fix_proposals
      SET status = 'applied', applied_commit_sha = ${commitSha}, updated_at = now()
      WHERE id = ${id} AND status = 'proposed'
    `;
  }

  async markStale(id: string): Promise<void> {
    await this.sql`
      UPDATE fix_proposals SET status = 'stale', updated_at = now()
      WHERE id = ${id} AND status = 'proposed'
    `;
  }
}

export const fixProposalRepository = new FixProposalRepository(
  postgres(env.DATABASE_URL, { max: 5 }),
);
