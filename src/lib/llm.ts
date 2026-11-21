// Server-only: never import this from a client component (it uses ANTHROPIC_API_KEY).
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export const DEFAULT_MODEL = "claude-opus-5-5";

// Reads ANTHROPIC_API_KEY from env. SDK retries 429/5xx twice by default.
const client = new Anthropic();

export type LLMOptions = {
  system?: string;
  model?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
};

export type LLMInput = string | Anthropic.MessageParam[];

export class LLMError extends Error {}

function toMessages(input: LLMInput): Anthropic.MessageParam[] {
  return typeof input === "string" ? [{ role: "user", content: input }] : input;
}

function baseParams(input: LLMInput, opts: LLMOptions) {
  return {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    ...(opts.system ? { system: opts.system } : {}),
    messages: toMessages(input),
  };
}

function checkStop(res: { stop_reason: string | null }) {
  if (res.stop_reason === "refusal") throw new LLMError("Claude declined this request");
  if (res.stop_reason === "max_tokens") throw new LLMError("Response hit maxTokens; raise it");
}

/** Plain text answer. */
export async function generateText(input: LLMInput, opts: LLMOptions = {}): Promise<string> {
  const res = await client.messages.create({
    ...baseParams(input, opts),
    output_config: { effort: opts.effort ?? "low" },
  });
  checkStop(res);
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Typed JSON answer, validated against a zod schema. */
export async function generateJSON<T>(
  input: LLMInput,
  schema: z.ZodType<T>,
  opts: LLMOptions = {},
): Promise<T> {
  const res = await client.messages.parse({
    ...baseParams(input, opts),
    output_config: { effort: opts.effort ?? "low", format: zodOutputFormat(schema) },
  });
  checkStop(res);
  if (res.parsed_output == null) throw new LLMError("Claude returned no parseable JSON");
  return res.parsed_output as T;
}
