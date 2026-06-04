import Anthropic from '@anthropic-ai/sdk';
import type { CompletionRequest, LLMProvider } from './provider.js';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model: string) {
    this.model = model;
    this.client = new Anthropic({ apiKey });
  }

  async complete(req: CompletionRequest): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
  }
}
