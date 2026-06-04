/**
 * Pure decision logic for the "docs PR mirrors the source PR" model.
 *
 * On every source-PR event (opened / new commits / reopened) we re-run the agent
 * and reconcile the docs PR against the current plan:
 *
 *   wants docs change?   docs PR exists?   ->  action
 *   ------------------    --------------       ------
 *        yes                  no                open
 *        yes                  yes               update
 *        no                   yes               close   (code was reverted/changed)
 *        no                   no                noop
 */
export type SyncAction = 'open' | 'update' | 'close' | 'noop';

export function decideAction(
  needsDocsUpdate: boolean,
  editCount: number,
  existingDocsPrNumber: number | null,
): SyncAction {
  const wantsDocsChange = needsDocsUpdate && editCount > 0;
  const hasOpenPr = existingDocsPrNumber != null;

  if (wantsDocsChange && !hasOpenPr) return 'open';
  if (wantsDocsChange && hasOpenPr) return 'update';
  if (!wantsDocsChange && hasOpenPr) return 'close';
  return 'noop';
}

/** Stable docs branch for a given source PR — reused across commits so the PR is updated, not duplicated. */
export function docsBranchName(sourcePrNumber: number): string {
  return `docs-sync/pr-${sourcePrNumber}`;
}
