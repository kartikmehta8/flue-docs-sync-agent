import type { RepoRef } from './types.js';

export type Provider = 'anthropic' | 'openai';

export interface Config {
  /** Chosen LLM provider (Change 2). */
  provider: Provider;
  apiKey: string;
  model: string;

  githubToken: string;
  docsRepoToken: string;

  codeRepo: RepoRef;
  docsRepo: RepoRef;
  docsBaseBranch: string;

  prNumber: number;
  docsRepoDir: string;

  slackWebhookUrl?: string;
  dryRun: boolean;
}

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-opus-4-8',
  openai: 'gpt-4o',
};

function parseRepo(value: string, varName: string): RepoRef {
  const [owner, repo] = value.split('/');
  if (!owner || !repo) {
    throw new Error(`${varName} must be in "owner/repo" form, got: "${value}"`);
  }
  return { owner, repo };
}

/**
 * Resolve the provider. Explicit LLM_PROVIDER wins; otherwise infer from whichever
 * API key is present. If both keys are present and no provider is set, prefer anthropic.
 */
export function resolveProvider(env: NodeJS.ProcessEnv): Provider {
  const explicit = env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit) {
    if (explicit !== 'anthropic' && explicit !== 'openai') {
      throw new Error(`LLM_PROVIDER must be "anthropic" or "openai", got: "${explicit}"`);
    }
    return explicit;
  }
  const hasAnthropic = !!env.ANTHROPIC_API_KEY?.trim();
  const hasOpenAI = !!env.OPENAI_API_KEY?.trim();
  if (hasAnthropic) return 'anthropic';
  if (hasOpenAI) return 'openai';
  throw new Error(
    'No LLM provider configured. Set LLM_PROVIDER and the matching API key, ' +
      'or provide ANTHROPIC_API_KEY or OPENAI_API_KEY.',
  );
}

function requireApiKey(provider: Provider, env: NodeJS.ProcessEnv): string {
  const key = provider === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  const trimmed = key?.trim();
  if (!trimmed) {
    const varName = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(`Provider "${provider}" selected but ${varName} is not set.`);
  }
  return trimmed;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const provider = resolveProvider(env);
  const prNumber = Number.parseInt(required(env, 'PR_NUMBER'), 10);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error(`PR_NUMBER must be a positive integer, got: "${env.PR_NUMBER}"`);
  }

  return {
    provider,
    apiKey: requireApiKey(provider, env),
    model: env.LLM_MODEL?.trim() || DEFAULT_MODELS[provider],

    githubToken: required(env, 'GITHUB_TOKEN'),
    docsRepoToken: required(env, 'DOCS_REPO_PAT'),

    codeRepo: parseRepo(required(env, 'CODE_REPO'), 'CODE_REPO'),
    docsRepo: parseRepo(required(env, 'DOCS_REPO'), 'DOCS_REPO'),
    docsBaseBranch: env.DOCS_BASE_BRANCH?.trim() || 'main',

    prNumber,
    docsRepoDir: env.DOCS_REPO_DIR?.trim() || './docs-checkout',

    slackWebhookUrl: env.SLACK_WEBHOOK_URL?.trim() || undefined,
    dryRun: (env.DRY_RUN?.trim().toLowerCase() ?? 'false') === 'true',
  };
}
