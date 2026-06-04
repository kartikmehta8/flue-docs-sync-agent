import { runAgent } from './agent.js';
import { loadConfig, type Config } from './config.js';
import { decideAction, docsBranchName } from './decide.js';
import { listDocFiles } from './docs-map.js';
import {
  closeDocsPR,
  commitEditsToBranch,
  createOctokit,
  findOpenDocsPR,
  getChangedFiles,
  getPRMetadata,
  openDocsPR,
  updateDocsPRBody,
} from './github.js';
import { createProvider } from './llm/index.js';
import { sendSlackNotification, type SlackAction } from './slack.js';
import type { DocEdit, DocsPlan, PRMetadata, SyncResult } from './types.js';

function docsPrTitle(prNumber: number): string {
  return `docs: sync updates for PR #${prNumber}`;
}

function docsPrBody(pr: PRMetadata, reason: string, edits: DocEdit[]): string {
  const fileLines = edits.map((e) => `- \`${e.path}\` — ${e.summary}`).join('\n');
  return [
    `Automated documentation sync for ${pr.url} (#${pr.number}).`,
    '',
    `**Reason:** ${reason}`,
    '',
    '**Files updated:**',
    fileLines || '_none_',
    '',
    '---',
    '_Opened by the Documentation Sync Agent and kept in sync with the source PR.',
    'It updates automatically when new commits are pushed, and closes if docs are no longer affected._',
  ].join('\n');
}

export async function main(config: Config = loadConfig()): Promise<SyncResult> {
  const codeOctokit = createOctokit(config.githubToken);
  const docsOctokit = createOctokit(config.docsRepoToken);
  const llm = createProvider(config);

  console.log(
    `[docs-sync] provider=${llm.name} model=${llm.model} ` +
      `code=${config.codeRepo.owner}/${config.codeRepo.repo}#${config.prNumber} ` +
      `docs=${config.docsRepo.owner}/${config.docsRepo.repo}`,
  );

  // 1. Load source PR metadata. We act on OPEN PRs (opened / synchronize / reopened).
  const pr = await getPRMetadata(codeOctokit, config.codeRepo, config.prNumber);
  if (pr.state !== 'open') {
    console.log(`[docs-sync] Source PR is ${pr.state} — nothing to do.`);
    return { action: 'noop', skipped: 'source-pr-not-open', edits: [] };
  }

  const branch = docsBranchName(pr.number);
  const existing = await findOpenDocsPR(docsOctokit, config.docsRepo, branch);

  // 2. Live PR diff (recomputed on every commit) — ALL changed files, anywhere in the repo.
  const changedFiles = await getChangedFiles(codeOctokit, config.codeRepo, config.prNumber);
  console.log(
    `[docs-sync] ${changedFiles.length} changed files; ` +
      `existing docs PR: ${existing ? `#${existing.number}` : 'none'}`,
  );

  // 3. Run the agent (skip only when the PR changed nothing — the LLM decides doc impact).
  let plan: DocsPlan = { needsDocsUpdate: false, reason: 'No code changes in this PR.', filesToUpdate: [] };
  let edits: DocEdit[] = [];
  if (changedFiles.length > 0) {
    const docPaths = await listDocFiles(config.docsRepoDir);
    const run = await runAgent({ llm, docsRepoDir: config.docsRepoDir }, pr, changedFiles, docPaths);
    plan = run.plan;
    edits = run.edits;
  }
  console.log(`[docs-sync] needsDocsUpdate=${plan.needsDocsUpdate} edits=${edits.length} reason="${plan.reason}"`);

  // 4. Reconcile the docs PR against the current state.
  const action = decideAction(plan.needsDocsUpdate, edits.length, existing?.number ?? null);
  console.log(`[docs-sync] action=${action}`);

  if (config.dryRun) {
    console.log(`[docs-sync] DRY_RUN — would ${action} docs PR on branch ${branch}.`);
    for (const e of edits) console.log(`  - ${e.path}`);
    return { action, skipped: 'dry-run', plan, edits, branch };
  }

  const notify = async (slackAction: SlackAction, docsPrUrl: string, docsPrNumber: number) => {
    await sendSlackNotification(config.slackWebhookUrl, {
      action: slackAction,
      sourcePR: pr,
      plan,
      edits,
      docsPrUrl,
      docsPrNumber,
      docsRepo: `${config.docsRepo.owner}/${config.docsRepo.repo}`,
    });
  };

  switch (action) {
    case 'open': {
      await commitEditsToBranch(docsOctokit, {
        docsRepo: config.docsRepo,
        baseBranch: config.docsBaseBranch,
        branch,
        message: docsPrTitle(pr.number),
        edits,
      });
      const opened = await openDocsPR(docsOctokit, {
        docsRepo: config.docsRepo,
        baseBranch: config.docsBaseBranch,
        branch,
        title: docsPrTitle(pr.number),
        body: docsPrBody(pr, plan.reason, edits),
      });
      console.log(`[docs-sync] Opened docs PR: ${opened.prUrl}`);
      await notify('open', opened.prUrl, opened.prNumber); // Change 1
      return { action, plan, edits, branch, prUrl: opened.prUrl };
    }

    case 'update': {
      const result = await commitEditsToBranch(docsOctokit, {
        docsRepo: config.docsRepo,
        baseBranch: config.docsBaseBranch,
        branch,
        message: docsPrTitle(pr.number),
        edits,
      });
      await updateDocsPRBody(docsOctokit, config.docsRepo, existing!.number, docsPrBody(pr, plan.reason, edits));
      if (result.changed) {
        console.log(`[docs-sync] Updated docs PR #${existing!.number} with new content.`);
        await notify('update', existing!.url, existing!.number);
      } else {
        console.log(`[docs-sync] Docs PR #${existing!.number} already up to date — no Slack notification.`);
      }
      return { action, plan, edits, branch, prUrl: existing!.url };
    }

    case 'close': {
      await closeDocsPR(docsOctokit, config.docsRepo, existing!.number, branch);
      console.log(`[docs-sync] Closed docs PR #${existing!.number} (docs no longer affected).`);
      await notify('close', existing!.url, existing!.number);
      return { action, plan, edits: [], branch, prUrl: existing!.url };
    }

    default:
      console.log('[docs-sync] No docs PR needed and none exists — nothing to do.');
      return { action: 'noop', plan, edits: [] };
  }
}

// Run when invoked directly (node dist/index.js / tsx src/index.ts).
const isEntrypoint =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('index.ts') ||
  process.argv[1]?.endsWith('index.js');

if (isEntrypoint) {
  main()
    .then((result) => {
      console.log('[docs-sync] done:', JSON.stringify({ action: result.action, skipped: result.skipped, prUrl: result.prUrl }));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[docs-sync] failed:', err);
      process.exit(1);
    });
}
