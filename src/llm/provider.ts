/**
 * Provider-agnostic LLM interface. Both the Anthropic (Claude) and OpenAI
 * implementations conform to this so the agent never depends on a vendor SDK.
 */
export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens?: number;
  /** Lower = more deterministic. Defaults to 0 for reproducible doc edits. */
  temperature?: number;
}

export interface LLMProvider {
  /** Human-readable provider name, e.g. "anthropic" or "openai". */
  readonly name: string;
  /** The model id in use. */
  readonly model: string;
  /** Run a single text completion and return the raw text response. */
  complete(req: CompletionRequest): Promise<string>;
}
