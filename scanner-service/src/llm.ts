import Anthropic from "@anthropic-ai/sdk";

// ── Claude transport for the scanner service ─────────────────────────
//
// One call, one place. Every AI call site in scanner-service/src/ai.ts goes
// through generateContent() below. This file is deliberately separate from
// lib/llm.ts (the Next.js side): the scanner is the always-on Railway
// process, the drafting runs on Vercel, and neither imports the other.
//
// Sonnet 5.5 notes that bind this file:
//   - The model reasons adaptively by default, so response.content can hold
//     reasoning blocks ahead of the answer. Text is read by filtering for text
//     blocks, never by indexing the first block.
//   - Sampling parameters, reasoning-budget parameters and assistant prefill
//     are rejected with a 400. None of them is sent.
//   - There is no response-mime-type switch. JSON comes from the prompt;
//     the `json` option only tidies the returned text before JSON.parse.

export const LLM_MODEL = "claude-sonnet-5-5";
export const LLM_EFFORT = "medium" as const;
export const LLM_MAX_TOKENS = 16000;

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const ALLOWED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export class LlmRefusalError extends Error {
  constructor(message = `${LLM_MODEL} refused the request`) {
    super(message);
    this.name = "LlmRefusalError";
  }
}

export interface GenerateContentOptions {
  prompt: string;
  // `json` and `image` exist for parity with lib/llm.ts, which does not use
  // either today.
  json?: boolean;
  image?: { base64: string; mediaType: string };
  maxTokens?: number;
}

let client: Anthropic | null = null;

/** True when ANTHROPIC_API_KEY is set. Never cached, never exposes the value. */
export function hasLlmKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  if (!hasLlmKey()) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  // The SDK reads ANTHROPIC_API_KEY from the environment itself.
  if (!client) client = new Anthropic();
  return client;
}

function normaliseMediaType(raw: string): AllowedMediaType {
  const cleaned = raw.toLowerCase().split(";")[0].trim();
  return (ALLOWED_MEDIA_TYPES as readonly string[]).includes(cleaned)
    ? (cleaned as AllowedMediaType)
    : "image/jpeg";
}

function stripFence(text: string): string {
  const fenced = text.match(/^```[a-zA-Z0-9]*\s*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1].trim() : text;
}

function extractJson(text: string): string {
  const unfenced = stripFence(text);
  const objStart = unfenced.indexOf("{");
  const arrStart = unfenced.indexOf("[");
  const candidates = [objStart, arrStart].filter((i) => i !== -1);
  if (candidates.length === 0) return text;
  const start = Math.min(...candidates);
  const close = unfenced[start] === "{" ? "}" : "]";
  const end = unfenced.lastIndexOf(close);
  if (end <= start) return text;
  return unfenced.slice(start, end + 1);
}

export async function generateContent(
  options: GenerateContentOptions
): Promise<string> {
  const anthropic = getClient();

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (options.image) {
    // Image first, then the text. Reversed, the model answers about the
    // prompt without having seen the screenshot.
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: normaliseMediaType(options.image.mediaType),
        data: options.image.base64,
      },
    });
  }
  content.push({ type: "text", text: options.prompt });

  const response = await anthropic.beta.messages.create({
    model: LLM_MODEL,
    max_tokens: options.maxTokens ?? LLM_MAX_TOKENS,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: LLM_EFFORT },
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    console.error(`[llm] ${LLM_MODEL} refused the request (stop_reason=refusal)`);
    throw new LlmRefusalError();
  }

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return options.json ? extractJson(text) : text;
}
