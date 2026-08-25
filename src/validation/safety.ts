import type { FixEdit } from "../persistence/fix-proposals";

const SAFE_PATH = /^(?!\.)(?!.*(?:^|\/)(?:\.git|\.github|node_modules|__tests__|fixtures?)(?:\/|$))(?!.*(?:^|\/)(?:.*\.)?(?:test|spec|snap)\.[^/]+$)(?!.*\.env(?:\.|$))[A-Za-z0-9_./-]+$/;

export function validateFixEdits(edits: FixEdit[]): void {
  for (const edit of edits) {
    if (!SAFE_PATH.test(edit.path) || edit.path.includes("..")) {
      throw new Error(`AI fix contains a forbidden path: ${edit.path}`);
    }
  }
}
