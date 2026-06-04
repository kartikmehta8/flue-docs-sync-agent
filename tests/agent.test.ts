import { describe, expect, it, vi } from 'vitest';
import {
  generateEdits,
  parseEditedFile,
  parsePlan,
  planDocsUpdate,
  runAgent,
} from '../src/agent.js';
import type { LLMProvider } from '../src/llm/index.js';
import type { ChangedFile, PRMetadata } from '../src/types.js';

const pr: PRMetadata = {
  number: 7,
  title: 'Add token refresh to SDK',
  body: 'Adds refreshToken().',
  author: 'dev',
  url: 'https://github.com/acme/code/pull/7',
  state: 'open',
  merged: false,
  mergeCommitSha: null,
  baseRef: 'main',
  headRef: 'feat/refresh',
};

const relevant: ChangedFile[] = [
  { filename: 'src/sdk/auth.ts', status: 'modified', additions: 20, deletions: 2, patch: '@@ refreshToken @@' },
];

/** Build a fake provider that returns scripted responses in order. */
function fakeLLM(responses: string[]): LLMProvider {
  const queue = [...responses];
  return {
    name: 'fake',
    model: 'fake-1',
    complete: vi.fn(async () => {
      const next = queue.shift();
      if (next === undefined) throw new Error('fakeLLM: no more responses');
      return next;
    }),
  };
}

describe('parsePlan', () => {
  it('parses a clean JSON object', () => {
    const plan = parsePlan('{"needsDocsUpdate":true,"reason":"new method","filesToUpdate":["a.mdx"]}');
    expect(plan).toEqual({ needsDocsUpdate: true, reason: 'new method', filesToUpdate: ['a.mdx'] });
  });

  it('extracts JSON embedded in prose', () => {
    const plan = parsePlan('Sure!\n```json\n{"needsDocsUpdate":false,"reason":"none","filesToUpdate":[]}\n```');
    expect(plan.needsDocsUpdate).toBe(false);
  });

  it('throws on missing needsDocsUpdate', () => {
    expect(() => parsePlan('{"reason":"x"}')).toThrow();
  });
});

describe('parseEditedFile', () => {
  it('extracts content from the envelope', () => {
    const raw = '<<<FILE:docs/auth.mdx>>>\n# Auth\nrefreshToken()\n<<<END>>>';
    expect(parseEditedFile(raw, 'docs/auth.mdx')).toBe('# Auth\nrefreshToken()');
  });

  it('falls back to a generic envelope when path differs', () => {
    const raw = '<<<FILE:other.mdx>>>\nhi\n<<<END>>>';
    expect(parseEditedFile(raw, 'docs/auth.mdx')).toBe('hi');
  });

  it('throws when no envelope present', () => {
    expect(() => parseEditedFile('no markers here', 'a.mdx')).toThrow();
  });
});

describe('planDocsUpdate', () => {
  it('returns the parsed plan from the model', async () => {
    const llm = fakeLLM(['{"needsDocsUpdate":true,"reason":"r","filesToUpdate":["docs/auth.mdx"]}']);
    const plan = await planDocsUpdate(llm, { pr, relevantFiles: relevant, docPaths: ['docs/auth.mdx'] });
    expect(plan.filesToUpdate).toEqual(['docs/auth.mdx']);
  });
});

describe('generateEdits', () => {
  it('produces edits and skips no-op changes', async () => {
    const llm = fakeLLM([
      '<<<FILE:docs/auth.mdx>>>\n# Auth\n\nUse refreshToken().\n<<<END>>>', // changed
      '<<<FILE:docs/unchanged.mdx>>>\nsame\n<<<END>>>', // no-op
    ]);
    const edits = await generateEdits(
      llm,
      pr,
      relevant,
      { needsDocsUpdate: true, reason: 'new method', filesToUpdate: ['docs/auth.mdx', 'docs/unchanged.mdx'] },
      [
        { path: 'docs/auth.mdx', content: '# Auth\n' },
        { path: 'docs/unchanged.mdx', content: 'same' },
      ],
    );
    expect(edits).toHaveLength(1);
    expect(edits[0]?.path).toBe('docs/auth.mdx');
    expect(edits[0]?.content).toContain('refreshToken');
  });
});

describe('runAgent', () => {
  it('short-circuits when no docs update is needed', async () => {
    const llm = fakeLLM(['{"needsDocsUpdate":false,"reason":"no public API change","filesToUpdate":[]}']);
    const result = await runAgent({ llm, docsRepoDir: '/nope' }, pr, relevant, ['docs/auth.mdx']);
    expect(result.edits).toEqual([]);
    expect(result.plan.needsDocsUpdate).toBe(false);
  });
});
