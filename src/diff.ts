import type { ChangedFile } from './types.js';

/**
 * Build a compact textual diff summary for the LLM from ALL files changed by the PR
 * (anywhere in the repo — no path filtering). Each file's patch is truncated so a
 * large PR can't blow the context window.
 */
export function buildDiffSummary(
  files: ChangedFile[],
  maxPatchCharsPerFile = 6000,
): string {
  return files
    .map((file) => {
      const header = `### ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`;
      if (!file.patch) return `${header}\n(no textual diff available)`;
      const patch =
        file.patch.length > maxPatchCharsPerFile
          ? `${file.patch.slice(0, maxPatchCharsPerFile)}\n... [diff truncated]`
          : file.patch;
      return `${header}\n\`\`\`diff\n${patch}\n\`\`\``;
    })
    .join('\n\n');
}
