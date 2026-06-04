import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DocFile } from './types.js';

const DOC_EXTENSIONS = new Set(['.md', '.mdx']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next']);

/**
 * Recursively enumerate documentation files (.md/.mdx) under `docsDir`.
 * Returns paths relative to `docsDir`, sorted for deterministic output.
 */
export async function listDocFiles(docsDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // missing directory -> no docs
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(path.join(dir, entry.name));
      } else if (entry.isFile() && DOC_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(path.relative(docsDir, path.join(dir, entry.name)));
      }
    }
  }

  await walk(docsDir);
  return results.sort();
}

/** Load the contents of specific doc files. Missing files are returned with empty content. */
export async function loadDocFiles(
  docsDir: string,
  relPaths: string[],
): Promise<DocFile[]> {
  return Promise.all(
    relPaths.map(async (rel) => {
      try {
        const content = await fs.readFile(path.join(docsDir, rel), 'utf8');
        return { path: rel, content };
      } catch {
        return { path: rel, content: '' };
      }
    }),
  );
}
