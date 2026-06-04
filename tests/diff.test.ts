import { describe, expect, it } from 'vitest';
import { buildDiffSummary } from '../src/diff.js';
import type { ChangedFile } from '../src/types.js';

const f = (filename: string, patch = 'patch'): ChangedFile => ({
  filename,
  status: 'modified',
  additions: 1,
  deletions: 0,
  patch,
});

describe('buildDiffSummary', () => {
  it('summarizes every changed file regardless of path', () => {
    const out = buildDiffSummary([f('lib/internal/util.ts'), f('scripts/build.sh')]);
    expect(out).toContain('lib/internal/util.ts');
    expect(out).toContain('scripts/build.sh');
  });

  it('includes filename, stats and patch', () => {
    const out = buildDiffSummary([f('src/api/users.ts', '@@ -1 +1 @@')]);
    expect(out).toContain('src/api/users.ts');
    expect(out).toContain('+1/-0');
    expect(out).toContain('@@ -1 +1 @@');
  });

  it('truncates long patches', () => {
    const big = 'x'.repeat(10_000);
    const out = buildDiffSummary([f('README.md', big)], 100);
    expect(out).toContain('[diff truncated]');
    expect(out.length).toBeLessThan(1000);
  });

  it('notes missing patches', () => {
    const out = buildDiffSummary([{ filename: 'a.ts', status: 'added', additions: 0, deletions: 0 }]);
    expect(out).toContain('no textual diff available');
  });
});
