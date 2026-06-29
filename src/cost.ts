export type Usage = { input_tokens: number; output_tokens: number };

// $ per 1,000,000 tokens
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function costUsd(usage: Usage, model: string): number {
  const price = MODEL_PRICING[model];
  if (!price) throw new Error(`unknown model for pricing: ${model}`);
  return (usage.input_tokens * price.input + usage.output_tokens * price.output) / 1_000_000;
}
