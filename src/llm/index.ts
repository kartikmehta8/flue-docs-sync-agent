import type { Config } from '../config.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import type { LLMProvider } from './provider.js';

export type { LLMProvider, CompletionRequest } from './provider.js';

/** Build the configured LLM provider (Change 2: OpenAI or Claude). */
export function createProvider(config: Config): LLMProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config.apiKey, config.model);
    case 'openai':
      return new OpenAIProvider(config.apiKey, config.model);
    default: {
      // Exhaustiveness guard.
      const never: never = config.provider;
      throw new Error(`Unsupported provider: ${String(never)}`);
    }
  }
}
