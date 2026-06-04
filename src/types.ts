/** Shared domain types for the docs sync agent. */

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface PRMetadata {
  number: number;
  title: string;
  body: string;
  author: string;
  url: string;
  /** PR state: "open" or "closed". */
  state: string;
  merged: boolean;
  mergeCommitSha: string | null;
  baseRef: string;
  headRef: string;
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  /** Unified diff hunk for this file, when GitHub returns one. */
  patch?: string;
}

export interface DocFile {
  /** Path relative to the docs repo root. */
  path: string;
  content: string;
}

/** The agent's structured planning decision (mirrors the plan's JSON output). */
export interface DocsPlan {
  needsDocsUpdate: boolean;
  reason: string;
  filesToUpdate: string[];
}

/** A concrete edit the agent wants to apply to one doc file. */
export interface DocEdit {
  path: string;
  /** Full new file content. */
  content: string;
  /** One-line human summary of what changed and why. */
  summary: string;
}

export interface SyncResult {
  /** What was done this run: open / update / close the docs PR, or nothing. */
  action: 'open' | 'update' | 'close' | 'noop';
  /** Why the run stopped early, if it did. */
  skipped?:
    | 'source-pr-not-open'
    | 'no-relevant-code-changes'
    | 'dry-run';
  plan?: DocsPlan;
  edits: DocEdit[];
  branch?: string;
  prUrl?: string;
}
