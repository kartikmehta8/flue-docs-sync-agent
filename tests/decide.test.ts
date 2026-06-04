import { describe, expect, it } from 'vitest';
import { decideAction, docsBranchName } from '../src/decide.js';

describe('decideAction', () => {
  it('opens a new docs PR when docs are needed and none exists', () => {
    expect(decideAction(true, 2, null)).toBe('open');
  });

  it('updates the existing docs PR when docs are still needed', () => {
    expect(decideAction(true, 1, 12)).toBe('update');
  });

  it('closes the docs PR when docs are no longer needed (e.g. code reverted)', () => {
    expect(decideAction(false, 0, 12)).toBe('close');
  });

  it('does nothing when no docs needed and no PR exists', () => {
    expect(decideAction(false, 0, null)).toBe('noop');
  });

  it('treats needsDocsUpdate=true with zero edits as "no change wanted"', () => {
    // Plan said yes but the model produced no real edits -> close if a PR exists, else noop.
    expect(decideAction(true, 0, 12)).toBe('close');
    expect(decideAction(true, 0, null)).toBe('noop');
  });
});

describe('docsBranchName', () => {
  it('is stable per source PR (no SHA) so the docs PR is reused', () => {
    expect(docsBranchName(42)).toBe('docs-sync/pr-42');
    expect(docsBranchName(42)).toBe(docsBranchName(42));
  });
});
