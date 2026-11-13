// The API's usage block. input_tokens excludes cached tokens: cache writes and reads are reported (and billed)
// separately, and may be null when caching wasn't involved.
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number | null;
    ephemeral_1h_input_tokens?: number | null;
  } | null;
};

// $ per 1,000,000 tokens
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

// Prompt-cache prices as multiples of the model's input price.
export const CACHE_WRITE_5M = 1.25;
export const CACHE_WRITE_1H = 2;
export const CACHE_READ = 0.1;

export function costUsd(usage: Usage, model: string): number {
  const price = MODEL_PRICING[model];
  if (!price) throw new Error(`unknown model for pricing: ${model}`);
  const written = usage.cache_creation_input_tokens ?? 0;
  // With the per-TTL breakdown, an hour-long write is priced as one; anything not broken down is a 5-minute write.
  const hour = Math.min(usage.cache_creation?.ephemeral_1h_input_tokens ?? 0, written);
  const inputCost =
    usage.input_tokens * price.input +
    (written - hour) * price.input * CACHE_WRITE_5M +
    hour * price.input * CACHE_WRITE_1H +
    (usage.cache_read_input_tokens ?? 0) * price.input * CACHE_READ;
  return (inputCost + usage.output_tokens * price.output) / 1_000_000;
}
