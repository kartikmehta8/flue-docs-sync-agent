import { describe, expect, it, vi } from 'vitest';
import { buildSlackPayload, sendSlackNotification, type SlackNotification } from '../src/slack.js';

const notification: SlackNotification = {
  action: 'open',
  sourcePR: {
    number: 7,
    title: 'Add token refresh',
    body: 'x',
    author: 'dev',
    url: 'https://github.com/acme/code/pull/7',
    state: 'open',
    merged: false,
    mergeCommitSha: null,
    baseRef: 'main',
    headRef: 'feat',
  },
  plan: { needsDocsUpdate: true, reason: 'New SDK method refreshToken()', filesToUpdate: ['docs/auth.mdx'] },
  edits: [{ path: 'docs/auth.mdx', content: '...', summary: 'Document refreshToken()' }],
  docsPrUrl: 'https://github.com/acme/docs/pull/3',
  docsPrNumber: 3,
  docsRepo: 'acme/docs',
};

describe('buildSlackPayload', () => {
  it('includes full context: source PR, reason, files, and links', () => {
    const payload = buildSlackPayload(notification);
    const json = JSON.stringify(payload);
    expect(json).toContain('acme/docs#3');
    expect(json).toContain('New SDK method refreshToken()');
    expect(json).toContain('docs/auth.mdx');
    expect(json).toContain('https://github.com/acme/docs/pull/3'); // review button
    expect(json).toContain('https://github.com/acme/code/pull/7'); // source PR
    expect(payload.text).toContain('acme/docs#3'); // fallback text
  });

  it('uses an "updated" header and primary button for the update action', () => {
    const json = JSON.stringify(buildSlackPayload({ ...notification, action: 'update' }));
    expect(json).toContain('updated');
    expect(json).toContain('"style":"primary"');
    expect(json).toContain('docs/auth.mdx'); // still lists files
  });

  it('uses a "closed" header, no files block, and no primary button for close', () => {
    const json = JSON.stringify(buildSlackPayload({ ...notification, action: 'close', edits: [] }));
    expect(json).toContain('closed');
    expect(json).not.toContain('"style":"primary"');
    expect(json).toContain('View docs PR');
  });
});

describe('sendSlackNotification', () => {
  it('skips (returns false) when no webhook configured', async () => {
    const fetchFn = vi.fn();
    const sent = await sendSlackNotification(undefined, notification, fetchFn as never);
    expect(sent).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('POSTs the payload to the webhook', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'ok' }));
    const sent = await sendSlackNotification('https://hooks.slack.com/x', notification, fetchFn);
    expect(sent).toBe(true);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://hooks.slack.com/x');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toContain('Docs sync PR ready for review');
  });

  it('throws when Slack returns a non-OK status', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' }));
    await expect(
      sendSlackNotification('https://hooks.slack.com/x', notification, fetchFn),
    ).rejects.toThrow(/500/);
  });
});
