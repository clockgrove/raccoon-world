// Approved anchors (issue 140): every positive style anchor in the bible must be approved material, decided from
// facts, not from where the file lives. The facts are references/approved.json: each approved file's sha256 and the
// approval the repository records for it. An anchor passes when its bytes are an approved entry's bytes, wherever
// it lives; a rejected or unpicked candidate (a turnaround or 3D candidate, a proof output, a comparison strip)
// fails, in any folder.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

export const REGISTER = "references/approved.json";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** A bible anchor's path (relative to art/, where the bible is) as a repository path. */
export const repoPath = (anchorPath) => posix.normalize(posix.join("art", anchorPath));

/** Problems with the register itself: an entry whose file is missing or whose bytes differ from its sha256. */
export async function registerProblems(root, register) {
  const problems = [];
  if (register?.format !== "raccoon-world-approved/1" || !Array.isArray(register.files))
    return [`${REGISTER} must be raccoon-world-approved/1 with a files list`];
  for (const entry of register.files) {
    if (!/^[0-9a-f]{64}$/.test(entry.sha256 ?? "") || !entry.approvedBy || !entry.record)
      problems.push(`${REGISTER}: ${entry.path} needs its sha256, approvedBy and the record of its approval`);
    const bytes = await readFile(join(root, entry.path)).catch(() => null);
    if (!bytes) problems.push(`${REGISTER}: ${entry.path} does not exist`);
    else if (sha256(bytes) !== entry.sha256) problems.push(`${REGISTER}: ${entry.path} is not the approved bytes (${entry.sha256})`);
  }
  return problems;
}

/** The positive anchors that are not approved material: one message each. */
export async function unapprovedAnchors(root, anchors, register) {
  const approved = new Map((register?.files ?? []).map((entry) => [entry.sha256, entry]));
  const problems = [];
  for (const anchor of anchors) {
    const path = repoPath(anchor.path);
    const bytes = await readFile(join(root, path)).catch(() => null);
    if (!bytes) problems.push(`positive anchor ${anchor.path} does not exist`);
    else if (!approved.has(sha256(bytes)))
      problems.push(`unapproved material is a positive anchor: ${anchor.path} (its bytes are no approved file in ${REGISTER})`);
  }
  return problems;
}
