import type { LLMProvider } from './llm/index.js';
import { buildEditPrompt, buildPlanningPrompt, SYSTEM_PROMPT } from './prompt.js';
import type { ChangedFile, DocEdit, DocFile, DocsPlan, PRMetadata } from './types.js';
import { loadDocFiles } from './docs-map.js';
import { buildDiffSummary } from './diff.js';

/** Extract the first balanced JSON object from a model response. */
export function parsePlan(raw: string): DocsPlan {
  const start = raw.indexOf('{');
  if (start === -1) throw new Error(`No JSON object found in plan response: ${raw.slice(0, 200)}`);

  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error('Unterminated JSON object in plan response');

  const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<DocsPlan>;
  if (typeof parsed.needsDocsUpdate !== 'boolean') {
    throw new Error('Plan response missing boolean "needsDocsUpdate"');
  }
  return {
    needsDocsUpdate: parsed.needsDocsUpdate,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    filesToUpdate: Array.isArray(parsed.filesToUpdate)
      ? parsed.filesToUpdate.filter((f): f is string => typeof f === 'string')
      : [],
  };
}

/** Pull the file body out of the <<<FILE:path>>> ... <<<END>>> envelope. */
export function parseEditedFile(raw: string, expectedPath: string): string {
  const fenced = new RegExp(`<<<FILE:${escapeRegExp(expectedPath)}>>>\\n?([\\s\\S]*?)\\n?<<<END>>>`);
  const match = raw.match(fenced);
  if (match && match[1] !== undefined) return match[1];

  // Fallback: a generic envelope regardless of the path label.
  const generic = raw.match(/<<<FILE:[^>]*>>>\n?([\s\S]*?)\n?<<<END>>>/);
  if (generic && generic[1] !== undefined) return generic[1];

  throw new Error(`Could not parse edited content for ${expectedPath}`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface PlanInput {
  pr: PRMetadata;
  relevantFiles: ChangedFile[];
  docPaths: string[];
}

/** Ask the model whether docs need updating and which files. */
export async function planDocsUpdate(
  llm: LLMProvider,
  input: PlanInput,
): Promise<DocsPlan> {
  const diffSummary = buildDiffSummary(input.relevantFiles);
  const prompt = buildPlanningPrompt(input.pr, diffSummary, input.docPaths);
  const raw = await llm.complete({ system: SYSTEM_PROMPT, user: prompt, maxTokens: 1024 });
  return parsePlan(raw);
}

/** Generate the full new content for each file the plan flagged. */
export async function generateEdits(
  llm: LLMProvider,
  pr: PRMetadata,
  relevantFiles: ChangedFile[],
  plan: DocsPlan,
  docsToEdit: DocFile[],
): Promise<DocEdit[]> {
  const diffSummary = buildDiffSummary(relevantFiles);
  const edits: DocEdit[] = [];

  for (const doc of docsToEdit) {
    const prompt = buildEditPrompt(pr, diffSummary, doc, plan.reason);
    const raw = await llm.complete({ system: SYSTEM_PROMPT, user: prompt, maxTokens: 8192 });
    const newContent = parseEditedFile(raw, doc.path);

    // Skip no-op edits to avoid empty PRs.
    if (newContent.trim() === doc.content.trim()) continue;

    edits.push({
      path: doc.path,
      content: newContent,
      summary: plan.reason,
    });
  }

  return edits;
}

export interface AgentDeps {
  llm: LLMProvider;
  docsRepoDir: string;
}

export interface AgentRun {
  plan: DocsPlan;
  edits: DocEdit[];
}

/**
 * Full agent pass: plan, then (if needed) load the flagged docs and generate edits.
 * Pure with respect to GitHub/Slack — those are wired up in index.ts.
 */
export async function runAgent(
  deps: AgentDeps,
  pr: PRMetadata,
  relevantFiles: ChangedFile[],
  docPaths: string[],
): Promise<AgentRun> {
  const plan = await planDocsUpdate(deps.llm, { pr, relevantFiles, docPaths });
  if (!plan.needsDocsUpdate || plan.filesToUpdate.length === 0) {
    return { plan, edits: [] };
  }
  const docs = await loadDocFiles(deps.docsRepoDir, plan.filesToUpdate);
  const edits = await generateEdits(deps.llm, pr, relevantFiles, plan, docs);
  return { plan, edits };
}
