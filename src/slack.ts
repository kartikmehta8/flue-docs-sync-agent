import type { DocEdit, DocsPlan, PRMetadata } from './types.js';

/** Which lifecycle event the notification is announcing. */
export type SlackAction = 'open' | 'update' | 'close';

export interface SlackNotification {
  action: SlackAction;
  /** The source code PR that triggered the sync. */
  sourcePR: PRMetadata;
  /** The agent's planning decision (reason + impacted files). */
  plan: DocsPlan;
  /** The edits included in the docs PR (empty when closing). */
  edits: DocEdit[];
  /** URL of the docs PR. */
  docsPrUrl: string;
  docsPrNumber: number;
  docsRepo: string; // "owner/repo"
}

const HEADERS: Record<SlackAction, string> = {
  open: '📝 Docs sync PR ready for review',
  update: '🔄 Docs sync PR updated (new commits on source PR)',
  close: '✅ Docs sync PR closed — no docs changes needed anymore',
};

const LEADS: Record<SlackAction, (n: SlackNotification) => string> = {
  open: (n) => `*<${n.docsPrUrl}|${n.docsRepo}#${n.docsPrNumber}>* — anyone can review & merge.`,
  update: (n) =>
    `*<${n.docsPrUrl}|${n.docsRepo}#${n.docsPrNumber}>* was updated to match the latest commits. Please re-review.`,
  close: (n) =>
    `*<${n.docsPrUrl}|${n.docsRepo}#${n.docsPrNumber}>* was closed automatically — the source PR no longer requires doc changes.`,
};

/**
 * Build a Slack Block Kit payload for a docs-PR lifecycle event.
 * Includes full context (Change 1): source PR, the agent's reasoning, and the
 * exact files changed — so anyone can review and merge without digging.
 */
export function buildSlackPayload(n: SlackNotification): Record<string, unknown> {
  const fileLines = n.edits.map((e) => `• \`${e.path}\` — ${e.summary}`).join('\n');
  const text = `${HEADERS[n.action]}: ${n.docsRepo}#${n.docsPrNumber}`;

  const blocks: Record<string, unknown>[] = [
    { type: 'header', text: { type: 'plain_text', text: HEADERS[n.action] } },
    { type: 'section', text: { type: 'mrkdwn', text: LEADS[n.action](n) } },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Triggered by:*\n<${n.sourcePR.url}|#${n.sourcePR.number} ${n.sourcePR.title}>`,
        },
        { type: 'mrkdwn', text: `*Author:*\n${n.sourcePR.author}` },
      ],
    },
    { type: 'section', text: { type: 'mrkdwn', text: `*Why:* ${n.plan.reason}` } },
  ];

  if (n.action !== 'close') {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Files updated (${n.edits.length}):*\n${fileLines || '_none_'}`,
      },
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: n.action === 'close' ? 'View docs PR' : 'Review & merge' },
        url: n.docsPrUrl,
        ...(n.action === 'close' ? {} : { style: 'primary' as const }),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'View source PR' },
        url: n.sourcePR.url,
      },
    ],
  });

  return { text, blocks };
}

/** Minimal fetch-like signature so the sender is easy to test. */
export type FetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Post the notification to a Slack incoming webhook.
 * Returns false (and logs) if no webhook is configured, rather than throwing —
 * a missing Slack hook must never fail the docs sync.
 */
export async function sendSlackNotification(
  webhookUrl: string | undefined,
  notification: SlackNotification,
  fetchFn: FetchFn = fetch as unknown as FetchFn,
): Promise<boolean> {
  if (!webhookUrl) {
    console.warn('[slack] SLACK_WEBHOOK_URL not set — skipping notification.');
    return false;
  }
  const payload = buildSlackPayload(notification);
  const res = await fetchFn(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Slack webhook failed: ${res.status} ${detail}`);
  }
  return true;
}
