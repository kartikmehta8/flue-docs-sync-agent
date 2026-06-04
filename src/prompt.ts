import type { DocFile, PRMetadata } from './types.js';

/** System prompt — the agent's standing instructions (from the plan). */
export const SYSTEM_PROMPT = `You are a Documentation Sync Agent.

Determine whether documentation must be updated based on merged code changes, and
when it must, produce minimal, faithful edits.

Rules:
- Edit docs only. Never describe changes to source code.
- Prefer updating existing pages over creating new ones.
- Create new pages only when strictly necessary.
- Keep changes minimal and surgical.
- Never invent functionality. Only document what the diff actually shows.
- Preserve the existing tone, structure, and formatting of each doc.`;

const MAX_DOC_LIST = 400;

/**
 * Planning prompt: decide whether docs need updating and which files.
 * The model must reply with a single JSON object matching DocsPlan.
 */
export function buildPlanningPrompt(
  pr: PRMetadata,
  diffSummary: string,
  docPaths: string[],
): string {
  const truncatedList = docPaths.slice(0, MAX_DOC_LIST);
  const listNote =
    docPaths.length > truncatedList.length
      ? `\n(...${docPaths.length - truncatedList.length} more files omitted)`
      : '';

  return `A pull request was merged into the code repository. Decide whether the
documentation repository needs updating.

## Merged PR
- Number: #${pr.number}
- Title: ${pr.title}
- Author: ${pr.author}
- Body:
${pr.body || '(no description)'}

## Code diff (all changed files)
${diffSummary || '(no diff)'}

## Available documentation files
${truncatedList.join('\n') || '(none found)'}${listNote}

## Your task
Reply with a SINGLE JSON object and nothing else, in exactly this shape:
{
  "needsDocsUpdate": boolean,
  "reason": "short explanation",
  "filesToUpdate": ["relative/path/to/doc.mdx"]
}

- "filesToUpdate" must reference existing files from the list above, unless a new
  page is strictly necessary (then use a sensible new path).
- If no documentation change is warranted, set needsDocsUpdate to false and leave
  filesToUpdate empty.`;
}

/**
 * Edit prompt for a single doc file. The model must return the FULL new file
 * content wrapped in a fenced block tagged with the path.
 */
export function buildEditPrompt(
  pr: PRMetadata,
  diffSummary: string,
  doc: DocFile,
  reason: string,
): string {
  const isNew = doc.content.trim().length === 0;
  return `Update the documentation file below to reflect the merged code change.

## Why this file needs updating
${reason}

## Merged PR
- #${pr.number}: ${pr.title}

## Code diff (all changed files)
${diffSummary}

## Current content of \`${doc.path}\`${isNew ? ' (NEW FILE — does not exist yet)' : ''}
\`\`\`
${doc.content || '(empty / new file)'}
\`\`\`

## Your task
Return the COMPLETE new content of \`${doc.path}\`. Make the smallest set of changes
needed to keep the docs accurate. Preserve frontmatter, headings, and style.

Wrap your answer in a single fenced block exactly like this, with no commentary
before or after:

<<<FILE:${doc.path}>>>
...full new file content...
<<<END>>>`;
}
