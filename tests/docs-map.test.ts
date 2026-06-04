import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listDocFiles, loadDocFiles } from '../src/docs-map.js';

let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docs-map-'));
  await fs.mkdir(path.join(dir, 'guides'), { recursive: true });
  await fs.mkdir(path.join(dir, 'node_modules'), { recursive: true });
  await fs.writeFile(path.join(dir, 'index.md'), '# Home');
  await fs.writeFile(path.join(dir, 'guides', 'auth.mdx'), '# Auth');
  await fs.writeFile(path.join(dir, 'guides', 'logo.png'), 'binary');
  await fs.writeFile(path.join(dir, 'node_modules', 'skip.md'), 'ignored');
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('listDocFiles', () => {
  it('returns only .md/.mdx files, ignoring node_modules and non-docs', async () => {
    const files = await listDocFiles(dir);
    expect(files).toEqual(['guides/auth.mdx', 'index.md']);
  });

  it('returns empty for a missing directory', async () => {
    expect(await listDocFiles(path.join(dir, 'does-not-exist'))).toEqual([]);
  });
});

describe('loadDocFiles', () => {
  it('loads existing content and returns empty for missing files', async () => {
    const loaded = await loadDocFiles(dir, ['index.md', 'guides/new.mdx']);
    expect(loaded).toEqual([
      { path: 'index.md', content: '# Home' },
      { path: 'guides/new.mdx', content: '' },
    ]);
  });
});
