import { Octokit } from '@octokit/rest';
import type { ChangedFile, DocEdit, PRMetadata, RepoRef } from './types.js';

export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

/** Read metadata for the source PR in the code repo. */
export async function getPRMetadata(
  octokit: Octokit,
  repo: RepoRef,
  prNumber: number,
): Promise<PRMetadata> {
  const { data } = await octokit.pulls.get({
    owner: repo.owner,
    repo: repo.repo,
    pull_number: prNumber,
  });
  return {
    number: data.number,
    title: data.title,
    body: data.body ?? '',
    author: data.user?.login ?? 'unknown',
    url: data.html_url,
    state: data.state,
    merged: data.merged ?? false,
    mergeCommitSha: data.merge_commit_sha ?? null,
    baseRef: data.base.ref,
    headRef: data.head.ref,
  };
}

/**
 * List the files changed by the PR (base...head), including diff patches.
 * Works for open PRs — this is the live PR diff, recomputed on every commit.
 */
export async function getChangedFiles(
  octokit: Octokit,
  repo: RepoRef,
  prNumber: number,
): Promise<ChangedFile[]> {
  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner: repo.owner,
    repo: repo.repo,
    pull_number: prNumber,
    per_page: 100,
  });
  return files.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }));
}

/** Find an open docs PR for the given head branch, or null. */
export async function findOpenDocsPR(
  octokit: Octokit,
  docsRepo: RepoRef,
  branch: string,
): Promise<{ number: number; url: string } | null> {
  const { data } = await octokit.pulls.list({
    owner: docsRepo.owner,
    repo: docsRepo.repo,
    state: 'open',
    head: `${docsRepo.owner}:${branch}`,
    per_page: 1,
  });
  const pr = data[0];
  return pr ? { number: pr.number, url: pr.html_url } : null;
}

async function refExists(
  octokit: Octokit,
  repo: RepoRef,
  branch: string,
): Promise<boolean> {
  try {
    await octokit.git.getRef({ owner: repo.owner, repo: repo.repo, ref: `heads/${branch}` });
    return true;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return false;
    throw err;
  }
}

export interface CommitResult {
  commitSha: string;
  /** True if the branch was newly created. */
  created: boolean;
  /** True if the branch head moved (i.e. the edits actually changed something). */
  changed: boolean;
}

/**
 * Commit the given edits onto a fresh single commit on top of the docs base branch,
 * then create or force-update `branch` to point at it. Deterministic: same base +
 * same edits => same commit sha, so a no-op re-run leaves the branch untouched.
 */
export async function commitEditsToBranch(
  octokit: Octokit,
  opts: { docsRepo: RepoRef; baseBranch: string; branch: string; message: string; edits: DocEdit[] },
): Promise<CommitResult> {
  const { owner, repo } = opts.docsRepo;

  const baseRef = await octokit.git.getRef({ owner, repo, ref: `heads/${opts.baseBranch}` });
  const baseSha = baseRef.data.object.sha;
  const baseCommit = await octokit.git.getCommit({ owner, repo, commit_sha: baseSha });

  const tree = await Promise.all(
    opts.edits.map(async (edit) => {
      const blob = await octokit.git.createBlob({
        owner,
        repo,
        content: Buffer.from(edit.content, 'utf8').toString('base64'),
        encoding: 'base64',
      });
      return { path: edit.path, mode: '100644' as const, type: 'blob' as const, sha: blob.data.sha };
    }),
  );

  const newTree = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.data.tree.sha,
    tree,
  });
  const commit = await octokit.git.createCommit({
    owner,
    repo,
    message: opts.message,
    tree: newTree.data.sha,
    parents: [baseSha],
  });

  const exists = await refExists(octokit, opts.docsRepo, opts.branch);
  if (!exists) {
    await octokit.git.createRef({ owner, repo, ref: `refs/heads/${opts.branch}`, sha: commit.data.sha });
    return { commitSha: commit.data.sha, created: true, changed: true };
  }

  const current = await octokit.git.getRef({ owner, repo, ref: `heads/${opts.branch}` });
  const changed = current.data.object.sha !== commit.data.sha;
  if (changed) {
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${opts.branch}`,
      sha: commit.data.sha,
      force: true,
    });
  }
  return { commitSha: commit.data.sha, created: false, changed };
}

export async function openDocsPR(
  octokit: Octokit,
  opts: { docsRepo: RepoRef; baseBranch: string; branch: string; title: string; body: string },
): Promise<{ prUrl: string; prNumber: number }> {
  const pr = await octokit.pulls.create({
    owner: opts.docsRepo.owner,
    repo: opts.docsRepo.repo,
    title: opts.title,
    head: opts.branch,
    base: opts.baseBranch,
    body: opts.body,
  });
  return { prUrl: pr.data.html_url, prNumber: pr.data.number };
}

export async function updateDocsPRBody(
  octokit: Octokit,
  docsRepo: RepoRef,
  prNumber: number,
  body: string,
): Promise<void> {
  await octokit.pulls.update({
    owner: docsRepo.owner,
    repo: docsRepo.repo,
    pull_number: prNumber,
    body,
  });
}

/** Close the docs PR and delete its branch (used when the source change no longer needs docs). */
export async function closeDocsPR(
  octokit: Octokit,
  docsRepo: RepoRef,
  prNumber: number,
  branch: string,
): Promise<void> {
  await octokit.pulls.update({
    owner: docsRepo.owner,
    repo: docsRepo.repo,
    pull_number: prNumber,
    state: 'closed',
  });
  try {
    await octokit.git.deleteRef({
      owner: docsRepo.owner,
      repo: docsRepo.repo,
      ref: `heads/${branch}`,
    });
  } catch (err) {
    if ((err as { status?: number }).status !== 422 && (err as { status?: number }).status !== 404) {
      throw err;
    }
  }
}
