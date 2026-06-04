import { describe, expect, it } from 'vitest';
import { loadConfig, resolveProvider } from '../src/config.js';

const base = {
  PR_NUMBER: '42',
  GITHUB_TOKEN: 'gh',
  DOCS_REPO_PAT: 'pat',
  CODE_REPO: 'acme/code',
  DOCS_REPO: 'acme/docs',
};

describe('resolveProvider', () => {
  it('honors explicit LLM_PROVIDER', () => {
    expect(resolveProvider({ LLM_PROVIDER: 'openai' } as NodeJS.ProcessEnv)).toBe('openai');
    expect(resolveProvider({ LLM_PROVIDER: 'anthropic' } as NodeJS.ProcessEnv)).toBe('anthropic');
  });

  it('infers from whichever key is present', () => {
    expect(resolveProvider({ OPENAI_API_KEY: 'x' } as NodeJS.ProcessEnv)).toBe('openai');
    expect(resolveProvider({ ANTHROPIC_API_KEY: 'x' } as NodeJS.ProcessEnv)).toBe('anthropic');
  });

  it('prefers anthropic when both keys present and no explicit provider', () => {
    expect(
      resolveProvider({ OPENAI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y' } as NodeJS.ProcessEnv),
    ).toBe('anthropic');
  });

  it('rejects an invalid provider', () => {
    expect(() => resolveProvider({ LLM_PROVIDER: 'cohere' } as NodeJS.ProcessEnv)).toThrow();
  });

  it('throws when nothing is configured', () => {
    expect(() => resolveProvider({} as NodeJS.ProcessEnv)).toThrow();
  });
});

describe('loadConfig', () => {
  it('builds a full openai config with default model', () => {
    const cfg = loadConfig({
      ...base,
      LLM_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-test',
    } as NodeJS.ProcessEnv);
    expect(cfg.provider).toBe('openai');
    expect(cfg.model).toBe('gpt-4o');
    expect(cfg.apiKey).toBe('sk-test');
    expect(cfg.codeRepo).toEqual({ owner: 'acme', repo: 'code' });
    expect(cfg.prNumber).toBe(42);
  });

  it('uses anthropic default model and allows override', () => {
    const cfg = loadConfig({
      ...base,
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'ak',
      LLM_MODEL: 'claude-sonnet-4-6',
    } as NodeJS.ProcessEnv);
    expect(cfg.model).toBe('claude-sonnet-4-6');
  });

  it('throws when the selected provider key is missing', () => {
    expect(() =>
      loadConfig({ ...base, LLM_PROVIDER: 'openai' } as NodeJS.ProcessEnv),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it('rejects a malformed repo', () => {
    expect(() =>
      loadConfig({ ...base, ANTHROPIC_API_KEY: 'x', CODE_REPO: 'bad' } as NodeJS.ProcessEnv),
    ).toThrow(/owner\/repo/);
  });
});
