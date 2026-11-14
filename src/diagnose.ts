import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { DiagnosisSchema, type Diagnosis } from "./schema.ts";
import type { Usage } from "./cost.ts";

export const DEFAULT_MODEL = "claude-sonnet-4-6";

// About 150k tokens of plain log text: more than this won't fit one request with room for the answer.
export const MAX_INPUT_CHARS = 600_000;

export const DIAGNOSTIC_SYSTEM_PROMPT = [
  "You are a senior network engineer triaging an incident from a log, device-config",
  "snippet, or packet-capture summary. Diagnose the single most likely problem.",
  "",
  "Rules:",
  "- Choose exactly one issue_category from the allowed set.",
  "- Ground every claim in exact lines copied verbatim from the input (the evidence array).",
  "- Give a concrete, actionable suggested_fix.",
  "- Set confidence honestly: 0 means a guess, 1 means certain.",
].join("\n");

export class DiagnoseError extends Error {
  readonly stopReason: string | null;

  constructor(message: string, stopReason: string | null) {
    super(message);
    this.name = "DiagnoseError";
    this.stopReason = stopReason;
  }
}

export interface DiagnoseOptions {
  client?: Anthropic;
  model?: string;
  thinking?: boolean;
}

export async function diagnose(
  input: string,
  options: DiagnoseOptions = {},
): Promise<{ diagnosis: Diagnosis; usage: Usage }> {
  if (!input.trim()) {
    throw new DiagnoseError("Nothing to triage: the input is empty.", null);
  }
  if (input.length > MAX_INPUT_CHARS) {
    throw new DiagnoseError(
      `The input is too big for one request (${input.length.toLocaleString("en-US")} characters, the limit is ` +
        `${MAX_INPUT_CHARS.toLocaleString("en-US")}). Trim it to the window around the fault and try again.`,
      null,
    );
  }
  const client = options.client ?? new Anthropic();
  const model = options.model ?? DEFAULT_MODEL;
  const thinking = options.thinking ?? true;

  const params = {
    model,
    max_tokens: 2048,
    ...(thinking ? { thinking: { type: "adaptive" as const } } : {}),
    output_config: { format: zodOutputFormat(DiagnosisSchema) },
    system: DIAGNOSTIC_SYSTEM_PROMPT,
    messages: [{ role: "user" as const, content: input }],
  };

  let lastStop: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.parse(params);
    if (response.parsed_output) {
      return { diagnosis: response.parsed_output, usage: response.usage };
    }
    lastStop = response.stop_reason;
  }
  throw new DiagnoseError(
    `model did not return a valid diagnosis (stop_reason=${lastStop})`,
    lastStop,
  );
}
