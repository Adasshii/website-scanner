# Testing Patterns

**Analysis Date:** 2026-07-16

## Test Framework

**Status:** No test framework configured.

**Installed:** None. Neither root `package.json` nor `scanner-service/package.json` include jest, vitest, mocha, playwright-test, or any other test runner.

**Scripts:** No `test`, `test:*`, or coverage scripts in either `package.json`.

**Test Files:** Zero test files (`*.test.ts`, `*.spec.ts`, `__tests__`) found in the repository.

This is a ground-truth report: the codebase currently has no automated testing.

---

## First Test Setup: What's Needed

To add testing to this project, you need to make three decisions:

### 1. **Which test runner?**

| Runner | Good for | Trade-off |
|--------|----------|-----------|
| **Jest** | Unit tests on Next.js logic, utils | Slower startup, heavyweight config |
| **Vitest** | Next.js + scanner-service (monorepo) | Still TypeScript-first, faster than Jest |
| **Playwright** | E2E tests (already a dep in scanner-service) | Separate from unit tests; slower to run |

**Recommendation for this codebase:** Start with **Vitest** for unit + integration tests (covers both Next.js and Express), then add **Playwright** for E2E once unit coverage is solid.

### 2. **Where do tests live?**

**Proposed structure:**
```
app/
  api/
    scan/
      route.ts
      route.test.ts         ← Test here
lib/
  supabase.ts
  supabase.test.ts          ← Test here
components/
  ui/
    button.tsx
    button.test.tsx         ← Test here
scanner-service/
  src/
    scanner.ts
    scanner.test.ts         ← Test here
```

Co-locate tests with source files (same directory). This matches Next.js conventions and keeps tests close to what they test.

### 3. **What should be tested first?**

**Priority order** (by risk and coverage impact):

1. **URL validation** (`lib/url-validation.ts`, `lib/url-validation.server.ts`)
   - Security-critical (SSRF protection)
   - Tested patterns: valid/invalid URLs, private IP blocking, DNS resolution
   - Low setup cost (no DB mocking)
   - **Recommended first test suite** — start here

2. **API scan endpoint** (`app/api/scan/route.ts`)
   - Complex logic: validation → caching → rate limiting → scanner call → DB write
   - Needs mocks: Supabase, ScannerClient, external calls
   - High risk (financial, security implications)
   - **Second priority**

3. **i18n helpers** (`lib/i18n-helpers.ts`)
   - Pure functions, no side effects
   - Bilingual content logic is error-prone
   - Test patterns: locale resolution, content swapping
   - **Third priority**

4. **Scanner service routes** (`scanner-service/src/index.ts`)
   - Complex scanning pipeline (Playwright, Lighthouse, AI)
   - Needs: browser mocks, service stubs
   - High setup cost; recommend E2E + manual testing first

5. **Component unit tests** (`components/ui/*.tsx`, `components/scan/*.tsx`)
   - Lower risk (visual regressions caught by snapshots or manual review)
   - Needs: React Testing Library setup
   - **Lower priority** — add after core logic is covered

---

## Test Structure (Once Implemented)

**Framework:** Vitest + React Testing Library (proposed)

**Config file location:** `vitest.config.ts` (root)

**Run commands (proposed):**
```bash
npm run test              # Run all tests once
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
```

**Example test structure** for a utility:

```typescript
// lib/url-validation.test.ts
import { describe, it, expect } from "vitest";
import { validateUrlFormat, UrlValidationError, extractDomain } from "./url-validation";

describe("validateUrlFormat", () => {
  it("accepts fully-qualified URLs", () => {
    expect(validateUrlFormat("https://example.com")).toBe("https://example.com/");
  });

  it("adds https:// to bare domains", () => {
    expect(validateUrlFormat("example.com")).toBe("https://example.com/");
  });

  it("rejects empty input", () => {
    expect(() => validateUrlFormat("")).toThrow(UrlValidationError);
    expect(() => validateUrlFormat("  ")).toThrow(UrlValidationError);
  });

  it("rejects non-HTTP(S) protocols", () => {
    expect(() => validateUrlFormat("ftp://example.com")).toThrow(UrlValidationError);
  });

  it("rejects URLs with credentials", () => {
    expect(() => validateUrlFormat("https://user:pass@example.com")).toThrow(UrlValidationError);
  });

  it("rejects bare words (no TLD)", () => {
    expect(() => validateUrlFormat("localhost")).toThrow(UrlValidationError);
    expect(() => validateUrlFormat("intranet")).toThrow(UrlValidationError);
  });

  it("allows localhost with explicit protocol", () => {
    expect(validateUrlFormat("http://localhost:3000")).toMatch(/^http:\/\/localhost/);
  });
});

describe("extractDomain", () => {
  it("strips www. prefix", () => {
    expect(extractDomain("https://www.example.com")).toBe("example.com");
  });

  it("preserves domain without www.", () => {
    expect(extractDomain("https://example.com")).toBe("example.com");
  });
});
```

**Example test structure** for a server-side integration:

```typescript
// lib/url-validation.server.test.ts
import { describe, it, expect, vi } from "vitest";
import * as dns from "dns/promises";
import { validateUrlSafe, UrlValidationError } from "./url-validation.server";

vi.mock("dns/promises", () => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}));

describe("validateUrlSafe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts public IPv4 addresses", async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(["93.184.216.34"]); // example.com
    vi.mocked(dns.resolve6).mockResolvedValue([]);
    
    const result = await validateUrlSafe("example.com");
    expect(result).toBe("https://example.com/");
  });

  it("blocks private IPv4 (10.x.x.x)", async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(["10.0.0.1"]);
    vi.mocked(dns.resolve6).mockResolvedValue([]);
    
    await expect(validateUrlSafe("internal.local")).rejects
      .toThrow(/private network/i);
  });

  it("blocks private IPv4 (192.168.x.x)", async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(["192.168.1.1"]);
    vi.mocked(dns.resolve6).mockResolvedValue([]);
    
    await expect(validateUrlSafe("router.local")).rejects
      .toThrow(/private network/i);
  });

  it("blocks private IPv6", async () => {
    vi.mocked(dns.resolve4).mockResolvedValue([]);
    vi.mocked(dns.resolve6).mockResolvedValue(["fc00::1"]);
    
    await expect(validateUrlSafe("ipv6.local")).rejects
      .toThrow(/private network/i);
  });

  it("blocks metadata endpoints", async () => {
    await expect(validateUrlSafe("metadata.google.internal"))
      .rejects.toThrow(/not allowed/i);
  });

  it("requires at least one resolvable address", async () => {
    vi.mocked(dns.resolve4).mockResolvedValue([]);
    vi.mocked(dns.resolve6).mockResolvedValue([]);
    
    await expect(validateUrlSafe("nonexistent.invalid"))
      .rejects.toThrow(/could not resolve/i);
  });
});
```

**Example API route test** (with mocks):

```typescript
// app/api/scan/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { createServerClient } from "@/lib/supabase";
import { ScannerClient } from "@/lib/scanner-client";

vi.mock("@/lib/supabase");
vi.mock("@/lib/scanner-client");

describe("POST /api/scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when URL is missing", async () => {
    const request = new Request("http://localhost/api/scan", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/provide a URL/i);
  });

  it("returns 400 when URL is invalid", async () => {
    const request = new Request("http://localhost/api/scan", {
      method: "POST",
      body: JSON.stringify({ url: "ftp://invalid.com" }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/protocol|http/i);
  });

  it("returns 429 when rate limit exceeded", async () => {
    // Mock Supabase count to return 5 recent scans
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ count: 5, data: [] }),
    } as any);

    const request = new Request("http://localhost/api/scan", {
      method: "POST",
      body: JSON.stringify({ url: "example.com" }),
      headers: new Headers({ "x-forwarded-for": "203.0.113.1" }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toMatch(/scan limit/i);
  });

  it("returns cached result on cache hit", async () => {
    // Mock cached result
    const mockCached = {
      id: "scan-123",
      url: "https://example.com/",
      scores: { performance: 85 },
    };

    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockCached }),
    } as any);

    const request = new Request("http://localhost/api/scan", {
      method: "POST",
      body: JSON.stringify({ url: "example.com" }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.cached).toBe(true);
    expect(data.id).toBe("scan-123");
  });
});
```

---

## Mocking Strategy

**External dependencies to mock:**
- Supabase client (`@/lib/supabase.ts`) — returns fixed data
- ScannerClient (`@/lib/scanner-client.ts`) — returns mock scan results
- DNS resolution (`dns/promises`) — control what IPs are "resolved"
- Environment variables — set in test setup

**What NOT to mock:**
- URL validation logic (test the real validation)
- Error types (catch real errors)
- Date/crypto functions (use real implementations or minimal stubs)

**Vitest mocking pattern:**
```typescript
import { vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  createServerClient: vi.fn(),
}));

// Usage in test:
vi.mocked(createServerClient).mockReturnValue({
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  // ...
});
```

---

## Fixtures and Factories

**Test data location** (proposed): `__fixtures__/` in each test directory or a shared `tests/fixtures/` folder.

**Example fixture** (pending implementation):

```typescript
// tests/fixtures/scan.ts
export const mockScanRow = {
  id: "scan-123",
  url: "https://example.com",
  domain: "example.com",
  type: "quick" as const,
  status: "quick_done" as const,
  locale: "en",
  scores: {
    performance: 85,
    accessibility: 92,
    // ...
  },
  summary: null,
  created_at: new Date().toISOString(),
  // ... other fields
};

export const mockScannerResult = {
  scores: { performance: 85 },
  summary: { verdict: "...", topIssues: [] },
  pages: [],
  screenshots: null,
};
```

---

## Coverage

**Status:** No coverage enforced.

**If added** (proposed):
- Minimum threshold: 70% overall
- Critical paths (validation, API endpoints): 90%+
- Lower threshold for UI components (50–60% acceptable for snapshots)

**View coverage** (once Vitest is set up):
```bash
npm run test:coverage
# → Coverage table in terminal + HTML report in coverage/
```

---

## Test Types

**Unit Tests** (proposed priority):
- Validation functions: format, SSRF protection, domain extraction
- i18n helpers: locale resolution, content swapping
- Scoring/analysis helpers
- **Scope:** Pure functions with no external dependencies; run in milliseconds

**Integration Tests** (proposed secondary):
- API endpoints with mocked Supabase + ScannerClient
- Database queries and updates (mock Supabase responses)
- Error handling and status codes
- Rate limiting and caching logic
- **Scope:** Route handlers, client initialization; mock external services

**E2E Tests** (proposed tertiary):
- Full scan submission flow (form → API → results display)
- Bilingual content rendering
- Admin dashboard functions
- **Scope:** Real browser (Playwright) + staging DB; run against live or staging URL
- **Tool:** Playwright (already a dependency in scanner-service)

**Manual Testing:**
- Scanner service with real Playwright browser (complex to mock)
- Real Lighthouse runs (time-intensive, best in CI or per-release)
- Visual regression checks (compare before/after screenshots)

---

## Common Patterns (To Be Implemented)

**Async Testing:**
```typescript
it("resolves DNS and returns URL", async () => {
  const result = await validateUrlSafe("example.com");
  expect(result).toMatch(/^https?:\/\//);
});
```

**Error Testing:**
```typescript
it("throws UrlValidationError on invalid input", () => {
  expect(() => validateUrlFormat("ftp://x"))
    .toThrow(UrlValidationError);
  expect(() => validateUrlFormat("invalid"))
    .toThrow(/valid URL/i);
});

it("rejects with specific HTTP status", async () => {
  const response = await POST(invalidRequest);
  expect(response.status).toBe(400);
});
```

**Mocking Express Request/Response** (for scanner-service routes):
```typescript
import { vi } from "vitest";
import type { Request, Response } from "express";

const mockReq = {
  headers: { authorization: "Bearer valid-key" },
  body: { url: "example.com" },
} as Partial<Request>;

const mockRes = {
  status: vi.fn().mockReturnThis(),
  json: vi.fn(),
} as Partial<Response>;

// Pass to route handler:
await handler(mockReq as Request, mockRes as Response);
expect(mockRes.json).toHaveBeenCalledWith(/* ... */);
```

---

## Next Steps (If Testing Is Added)

1. **Install Vitest and React Testing Library:**
   ```bash
   npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
   npm install -D -w scanner-service vitest  # In monorepo, if used
   ```

2. **Create vitest.config.ts:**
   ```typescript
   import { defineConfig } from "vitest/config";
   import path from "path";

   export default defineConfig({
     test: {
       globals: true,
       environment: "jsdom",
       setupFiles: ["./vitest.setup.ts"],
       coverage: {
         provider: "v8",
         reporter: ["text", "html"],
         exclude: ["node_modules", "dist"],
       },
     },
     resolve: {
       alias: { "@": path.resolve(__dirname, "./") },
     },
   });
   ```

3. **Create vitest.setup.ts:**
   ```typescript
   import "@testing-library/jest-dom";
   ```

4. **Update package.json scripts:**
   ```json
   {
     "scripts": {
       "test": "vitest run",
       "test:watch": "vitest",
       "test:coverage": "vitest run --coverage"
     }
   }
   ```

5. **Start with URL validation tests** (lowest friction, highest value).

---

*Testing analysis: 2026-07-16*
