import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { env } from "../src/config/env";

const sql = postgres(env.DATABASE_URL);
try {
  await sql.unsafe(await readFile(new URL("../migrations/001_fix_proposals.sql", import.meta.url), "utf8"));
} finally {
  await sql.end();
}
