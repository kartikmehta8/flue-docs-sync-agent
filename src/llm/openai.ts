import OpenAI from 'openai';
import type { CompletionRequest, LLMProvider } from './provider.js';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly model: string;
  private readonly client: OpenAI;

  constructor(apiKey: string, model: string) {
    this.model = model;
    this.client = new OpenAI({ apiKey });
  }

  async complete(req: CompletionRequest): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    });

    return (response.choices[0]?.message?.content ?? '').trim();
  }
}
