# LLM wrapper (`src/lib/llm.ts`)

Thin server-side wrapper around the Claude API (`@anthropic-ai/sdk`). Use it for all LLM calls — don't create new Anthropic clients elsewhere.

## Setup
- Env: `ANTHROPIC_API_KEY` (in `.env.local`; template in `.env.example`).
- Deps: `@anthropic-ai/sdk`, `zod`.
- **Server only** — import from route handlers / server actions / server components, never from `"use client"` files.

## API
```ts
import { generateText, generateJSON, LLMError } from "@/lib/llm";
import { z } from "zod";

// Plain text
const hi = await generateText("Say hi in 5 words.");

// Typed JSON (validated against the zod schema) — preferred for features
const vibe = await generateJSON(
  "Describe this listener's vibe: ...",
  z.object({ vibe: z.string(), emoji: z.string(), summary: z.string() }),
  { system: "You are a music taste analyst.", effort: "low" },
);
```

- `input`: a string, or a full `Anthropic.MessageParam[]` history (for multi-turn).
- `opts`: `system`, `model` (default `claude-opus-5-5`), `maxTokens` (default 16000), `effort` (`low` default | `medium` | `high`).
- Throws `LLMError` on refusal / truncation (`max_tokens`). SDK errors (rate limit, auth) propagate; the SDK auto-retries 429/5xx twice.

## Conventions
- Put feature-specific prompts + schemas next to the feature (e.g. `src/lib/vibe.ts`), and keep `llm.ts` generic.
- No prefill / `temperature` — not supported on current models. Shape output with zod schemas instead.

## Dev check
`GET /api/dev/llm` (`src/app/api/dev/llm/route.ts`) — temporary smoke test, 404 in production. Delete once real features use the wrapper.
