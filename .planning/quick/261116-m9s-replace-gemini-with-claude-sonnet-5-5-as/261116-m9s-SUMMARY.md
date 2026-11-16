---
phase: quick
plan: 261116-m9s
subsystem: ai-provider
tags: [anthropic, claude-sonnet-5-5, llm, scanner-service, outreach-drafting, dependency-swap]
requires: []
provides:
  - scanner-service/src/llm.ts (hasLlmKey, generateContent, LlmRefusalError, LLM_MODEL, LLM_EFFORT, LLM_MAX_TOKENS)
  - lib/llm.ts (same surface, separate Next-side copy)
affects: [scanner-service/src/ai.ts, lib/draft-generator.ts, app/api/health/route.ts]
tech-stack:
  added: ["@anthropic-ai/sdk ^1.8.0 (root and scanner-service)"]
  removed: ["@google/generative-ai (root and scanner-service)"]
  patterns: ["one helper per runtime, never importing each other", "callers gate on hasLlmKey() and keep their own fallback value"]
key-files:
  created: [scanner-service/src/llm.ts, lib/llm.ts]
  modified:
    - scanner-service/src/ai.ts
    - lib/draft-generator.ts
    - lib/draft-generator.test.ts
    - app/api/health/route.ts
    - app/api/health/route.test.ts
    - package.json
    - package-lock.json
    - scanner-service/package.json
    - scanner-service/package-lock.json
    - .env.example
    - .claude/CLAUDE.md
decisions:
  - "Both helpers carry the same contract and stay separate; the model id lives only in each llm.ts"
  - "Effort pinned to medium and max_tokens to 16000 as single constants per helper"
  - "Refusal is thrown as LlmRefusalError and logged at both helper and call site, never read as empty content"
metrics:
  tasks: 3
  completed: 2026-11-16
status: complete
actuals:
  tokens: 40000
  tasks: 3
  commits: 3
plan_head_before: 3a35e4af52deb1e0b9dca0f03bf4147c358d9467
plan_head_after: a015d7934f934998f4afff56f4e184b2551b7b01
---

# Quick 261116-m9s: Replace Gemini with Claude Sonnet 5.5

Every AI call in the codebase (five in the scanner service, one in the outreach drafter) now runs on Claude Sonnet 5.5 through one `generateContent` helper per runtime. The Google SDK is gone from both packages and both lockfiles.

## Commits (all on gsd/phase-09-niche-profile, nothing pushed)

| Task | Commit | What |
|------|--------|------|
| 1 (tracer) | 8e37ad0 | Added `@anthropic-ai/sdk` to both packages with lockfiles in sync, wrote `scanner-service/src/llm.ts`, converted `generateDesignAnalysis` (image block, JSON path, dynamic media type) |
| 2 | e80f50c | Converted the other four scanner call sites, deleted the Google import, `genAI` and `getClient` from `ai.ts`, reworded provider names in comments |
| 3 | a015d79 | Wrote `lib/llm.ts`, rewrote the provider half of `lib/draft-generator.ts` (`defaultLlmGenerate`), tests, health check rename, `.env.example`, CLAUDE.md stack notes, removed the Google SDK from both packages |

## What the helper does

Image block before text block, media type normalised and clamped to jpeg/png/gif/webp, `client.beta.messages.create` with the server-side-fallback beta and `fallbacks: "default"`, `output_config.effort` pinned to `medium`, refusal check before the text path, text read by filtering for `type === "text"` blocks, and with `json: true` the fence is stripped and the outermost object or array returned. SDK errors propagate; every caller's existing try/catch logs and returns its own fallback. No sampling, reasoning-budget or prefill parameters are sent.

## Failure logs in lib/draft-generator.ts

Four substring-distinct lines, each resolving to null: `ANTHROPIC_API_KEY is not set`, `Claude call timed out after 45000ms`, `Claude call threw: <message>` (with `(rate limited)` and `(API error <status>)` variants chosen by `instanceof`), and `Claude refused to write this draft`. One test per branch plus a typed rate-limit test, a thinking-block-first extraction test, and a request-shape test (pinned model and effort, none of the rejected parameters).

## Verification

- `npx tsc --noEmit`: clean. `npx tsc --noEmit -p scanner-service/tsconfig.json`: clean.
- `npm run lint`: no warnings or errors.
- Full `npx vitest run`: 77 files, 1198 tests, all passed (23s). Baseline in the plan was 1193 in 77 files, so +5 tests, all in the draft/health area (`lib/draft-generator.test.ts` went from 3 to 7 tests in the `defaultLlmGenerate` block; I did not re-count the other delta against the baseline). The machine load average was around 8 at the start of the run and the suite still completed, so no timeout false failure occurred.
- `npm ci --ignore-scripts --dry-run` in `scanner-service/` succeeds; both lockfiles name `@anthropic-ai/sdk` and not the Google SDK.
- Grep gates: no `gemini`, `GoogleGenerativeAI` or `@google/generative-ai` in `lib/`, `app/`, `components/`, `types/`, `scanner-service/src/`, either `package.json`, or `.claude/CLAUDE.md`. No `GEMINI_API_KEY` in source, config or tests. No rejected parameters and no `content[0]` in either helper.
- Nothing under `.claude/worktrees/` or `supabase/migrations/` changed. The three untracked planning files stayed untracked.
- Prompt strings: checked programmatically that the four `${VOICE_DIRECTIVE}` prompts are byte-identical before and after.

## Deviations from Plan

**1. [Rule 1 - Scope] `.env.example` already had `ANTHROPIC_API_KEY`**
- Found during: Task 3. The file already carried `ANTHROPIC_API_KEY` at line 11 (under "Claude AI (Anthropic)"). Renaming line 30 would have produced a duplicate key.
- Fix: deleted the old `GEMINI_API_KEY` line instead of renaming it. The sed was permitted, so no manual step is needed.

**2. [Plan reference] `lib/draft-on-scan-complete.test.ts` does not exist**
- Only `lib/draft-on-scan-complete.integration.test.ts` exists (needs a live database). It was not run on its own; the full suite run covers whatever the unit project includes.

**3. Extra comment cleanups**
- Further comment-only provider names were reworded where the plan's zero-match grep required it: `scanner-service/src/ai.ts` comments, `lib/draft-generator.ts` header and DI comment, `app/api/health/route.ts` comment, `.claude/CLAUDE.md` (also the stale `GOOGLE_API_KEY` in the required-vars line and the Anthropic API platform line).

**4. Commit trailer**
- The plan's ground rule named `Co-Authored-By: Claude Opus 5`. The attribution instruction in this session specified `Claude Sonnet 5.5`, which is the model that did the work, so the commits carry `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

**5. Extra tests**
- Added a typed `RateLimitError` test and a request-shape test beyond the plan's list, to cover the `instanceof` classification and the "no rejected parameters" guarantee.

## Left for Joshua

- No code path was exercised against the live API. The first real scan (vision, comprehensive analysis, issue rewrites, why-it-matters, sales brief) and the first real draft are the first live calls. After the Railway deploy, watch for the `[llm]` refusal line and for `[ai] ... failed` lines in the logs.
- `ANTHROPIC_API_KEY` is set on Vercel Production (verified) and on Railway (reported, not verified by me). `GEMINI_API_KEY` stays set on both as the rollback path; removing it is a separate step.
- The Railway image rebuilds from `scanner-service/package-lock.json`; confirm the build succeeds on the dashboard, since Railway keeps serving the last good image if it fails.
- The branch is not merged or deployed.

## Known Stubs

None.

## Threat Flags

None. The only new outbound dependency is the Anthropic API (T-m9s-01 to T-m9s-SC in the plan); the key is read only via `process.env` inside each helper, never exported or logged.

## Self-Check: PASSED

- Files present: `scanner-service/src/llm.ts`, `lib/llm.ts`.
- Commits present on HEAD: 8e37ad0, e80f50c, a015d79 (`git rev-list --count` from the recorded base = 3).
