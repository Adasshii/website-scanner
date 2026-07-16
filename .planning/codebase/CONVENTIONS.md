# Coding Conventions

**Analysis Date:** 2026-07-16

## Naming Patterns

**Files:**
- React components: kebab-case (`components/ui/url-input.tsx`, `components/report/quick-wins.tsx`)
- Utilities and libraries: camelCase (`lib/i18n-helpers.ts`, `lib/supabase.ts`)
- API routes: route.ts files in `app/api/[path]/` (e.g., `app/api/scan/route.ts`)
- Page components: page.tsx in `app/[path]/` (e.g., `app/scan/[id]/page.tsx`)
- Server-only utilities: `.server.ts` suffix (e.g., `lib/url-validation.server.ts`)

**Functions:**
- Exported functions: camelCase (`validateUrlFormat`, `extractDomain`, `pickLocalizedScan`)
- React components: PascalCase (`Button`, `ScanResults`, `LanguageToggle`)
- Helper/utility functions: camelCase (`withTimeout`, `failScan`, `dedupeCookieAiIssues`)

**Variables:**
- Constants: UPPER_SNAKE_CASE (`REQUIRED_VARS`, `BLOCKED_IP_RANGES`, `PORT`)
- Local variables: camelCase (`domain`, `locale`, `ipHash`)
- Event handlers: `on[Event]` pattern (implicit in props)

**Types:**
- Interfaces: PascalCase with I prefix for function parameters (`ButtonProps`, `ScanLike`, `LocalizedScanContent`)
- Type aliases: PascalCase (`ButtonVariant`, `ButtonSize`)
- Record types: `Record<string, Type>` pattern used throughout

## Code Style

**Formatting:**
- ESLint: Next.js core-web-vitals + TypeScript recommended config (`@next/core-web-vitals`, `next/typescript`)
- No Prettier config; relies on Next.js ESLint defaults
- Line length: 80–100 characters typical
- Indentation: 2 spaces (TypeScript files)

**Linting:**
- Config: `.eslintrc.json` extends `next/core-web-vitals` and `next/typescript`
- Enforcement: `npm run lint` via Next.js CLI
- No custom rules beyond Next.js recommended set

## Import Organization

**Order:**
1. External packages (`express`, `next`, `react`, etc.)
2. Next.js utilities (`NextRequest`, `NextResponse`)
3. Relative imports from `@/` aliases (`@/lib`, `@/components`, `@/types`)
4. Type imports marked with `type` keyword when appropriate

**Path Aliases:**
- `@/*` → root directory (configured in `tsconfig.json` and `scanner-service/tsconfig.json`)
- `@shared/*` → `../types/*` (scanner-service only)

**Example from `app/api/scan/route.ts`:**
```typescript
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { validateUrlSafe, UrlValidationError } from "@/lib/url-validation.server";
import { extractDomain } from "@/lib/url-validation";
import type { ScanRow } from "@/types/scanner";
```

## Error Handling

**Strategy:** Custom error types + try-catch blocks with specific error type checks.

**Patterns:**

**1. Validation Errors (client-side format checks):**
Custom error class in `lib/url-validation.ts`:
```typescript
export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlValidationError";
  }
}

export function validateUrlFormat(input: string): string {
  if (!trimmed) {
    throw new UrlValidationError("Please enter a website URL.");
  }
  // ... validation logic
}
```

**2. Server-side validation (SSRF protection):**
File: `lib/url-validation.server.ts`
- Catches and re-throws validation errors
- Performs DNS resolution and IP validation
- Throws `UrlValidationError` for security violations
- Returns normalized URL on success

**3. API Route handlers:**
Pattern in `app/api/scan/route.ts` and similar:
```typescript
export async function POST(request: NextRequest) {
  try {
    // Input validation
    if (!rawUrl || typeof rawUrl !== "string") {
      return NextResponse.json({ error: "..." }, { status: 400 });
    }

    // Custom validation
    try {
      url = await validateUrlSafe(rawUrl);
    } catch (error) {
      if (error instanceof UrlValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error; // Re-throw non-validation errors
    }

    // Business logic
    // Database operations with error checks
    const { error: insertError } = await supabase.from("scans").insert(...);
    if (insertError) {
      console.error("Failed to create scan row:", insertError);
      return NextResponse.json({ error: "..." }, { status: 500 });
    }
  } catch (error) {
    console.error("Scan API error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Something went wrong...",
      },
      { status: 500 }
    );
  }
}
```

**4. Health checks:**
Pattern in `app/api/health/route.ts`:
```typescript
let db: { ok: boolean; error?: string } = { ok: false };
try {
  const supabase = createServerClient();
  const { error } = await supabase.from("scans").select(...);
  db = error ? { ok: false, error: error.message } : { ok: true };
} catch (e) {
  db = { ok: false, error: e instanceof Error ? e.message : String(e) };
}
```

## Logging

**Framework:** `console` (built-in Node.js logging)

**Patterns:**
- Log level indicators in brackets: `[scan]`, `[design-bg]`, `[scan-recovery]`
- Include relevant context: domain, locale, scan ID, user action
- Examples from `app/api/scan/route.ts`:
  ```typescript
  console.log(`[scan] ${domain} locale=${locale} cookie=${cookieLocale ?? "(none)"}`);
  console.log(`[scan] ${domain} cache hit (toggle=${locale}) id=${cached.id}`);
  ```
- Error logging: `console.error()` with context
  ```typescript
  console.error("Failed to create scan row:", insertError);
  ```

## Comments

**When to Comment:**
- Complex business logic (e.g., bilingual cache strategy in `app/api/scan/route.ts` lines 78–80)
- Non-obvious security decisions (SSRF protection in `lib/url-validation.server.ts`)
- Rate limiting and cache semantics
- Async patterns and timeout behavior

**JSDoc/TSDoc:**
Used selectively for public functions in libraries:

```typescript
/**
 * Client-side URL format validation and normalization.
 * Returns a normalized URL string or throws UrlValidationError.
 */
export function validateUrlFormat(input: string): string { ... }

/**
 * Server-side URL validation with SSRF protection.
 * Validates format, resolves DNS, and blocks private/reserved IPs.
 */
export async function validateUrlSafe(input: string): Promise<string> { ... }

/**
 * Apply per-issue alt-locale overrides to a list of pages.
 * Issue fields (title, description, ...) are swapped where an override exists.
 */
export function applyIssuesAlt(...): PageResult[] { ... }
```

## Function Design

**Size:** 40–150 lines typical; utility functions 10–50 lines.

**Parameters:** 
- Explicit parameters over config objects where arity is ≤ 3
- Type-annotated in TypeScript
- Optional params use `?` and default values
- Example: `pickLocalizedScan(scan: ScanLike, currentLocale: string): LocalizedScanContent`

**Return Values:**
- Explicit return type annotations on all exported functions
- Error cases throw custom error types or return error objects in API responses
- Async functions return `Promise<T>`
- Example: `validateUrlFormat(input: string): string` (throws on error)

## Module Design

**Exports:**
- Named exports for utilities and functions
- Default export for React components (implicit via file name)
- Type exports marked with `export type`

**Barrel Files:**
- Not used; imports are direct (`import { Button } from "@/components/ui/button"`)

**File Organization:**
- Utility libraries in `lib/` (supabase, validation, i18n, email, scoring)
- React components in `components/[category]/` (ui, layout, report, scan, admin)
- Pages in `app/[path]/page.tsx`
- API routes in `app/api/[path]/route.ts`
- Server actions in `app/actions/`
- Types in `types/` (shared with scanner-service via `@shared/*`)

## Supabase Client Access

**Pattern:** Separate factory functions in `lib/supabase.ts`

```typescript
// Server-side (full access, bypasses RLS) — API routes only
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // Never expose
  return createClient(url, key, { auth: { persistSession: false } });
}

// Browser-side (limited by RLS policies)
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}
```

**Usage:**
- API routes: always use `createServerClient()`
- Client components: use `createBrowserClient()` (not yet implemented; RLS policies enforce access)

## i18n Conventions

**Framework:** `next-intl` (Next.js 14 App Router)

**Patterns:**
- Hook-based translation: `useTranslations()` returns `t` function
- Namespace-based keys: `common.grade`, `common.locale`
- Helper functions for domain-specific logic: `lib/i18n-helpers.ts`

**Examples:**
```typescript
const t = useTranslations("common.grade");
return (score: number): string => {
  if (score >= 95) return t("excellent");
  if (score >= 85) return t("performingWell");
  // ...
};
```

**Bilingual Content Strategy:**
- Primary locale stored in `scan.locale`
- Alt-locale content in `scan.ai_content_alt` and `scan.issues_alt`
- Helper: `pickLocalizedScan()` resolves which content to display based on visitor locale
- Per-issue overrides: `applyIssuesAlt()` swaps specific fields (title, description, etc.)

## TypeScript Specifics

**Strict Mode:** Enabled (`"strict": true` in tsconfig.json)

**Path Aliases:**
- `@/*` resolves to project root
- Used throughout for clean imports

**Type Validation:**
- `satisfies` keyword used for inline type checking: `satisfies Omit<ScanRow, "created_at">`
- Prevents over-typing while catching errors early

**Network/API Types:**
- Custom types in `types/scanner.ts` shared with scanner-service
- Type guards (instanceof checks) for error handling

## Git Commit Style

**Format:** Conventional Commits with scope

**Pattern:** `<type>(<scope>): <subject>`

**Types observed:**
- `feat`: New feature
- `fix`: Bug fix
- `style`: Formatting only (not code style, but visual/UI)
- `refactor`: Code restructuring

**Scopes observed:**
- `scanner` – Scanner service changes
- `email` – Email functionality
- `voice` – Copy/messaging
- `i18n` – Internationalization
- No scope – General or multi-scope changes

**Examples:**
```
feat(i18n): bilingual scan reports — language toggle now flips AI content
fix(i18n): NL scans were returning English AI output
feat(email): add safety-net cron for missed report-ready emails
feat(voice): apply Adashi voice principles to all user-facing copy
fix(scanner): use CALLBACK_URL as full endpoint URL
```

**Message body:** Descriptive, breaking on line boundaries ~72 characters

---

*Convention analysis: 2026-07-16*
