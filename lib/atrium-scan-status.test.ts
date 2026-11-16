import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Issue, IssuesAlt, PageResult } from "@/types/scanner";
import { deriveProblems, getAtriumScanStatus, mapScanStatus } from "./atrium-scan-status";

function issue(overrides: Partial<Issue> & Pick<Issue, "id" | "severity" | "impact">): Issue {
  return {
    category: "performance",
    title: `title ${overrides.id}`,
    description: `description ${overrides.id}`,
    recommendation: "fix it",
    ...overrides,
  };
}

function page(issues: Issue[]): PageResult {
  return { issues } as unknown as PageResult;
}

describe("mapScanStatus", () => {
  it("maps every scans.status to the contract's four values", () => {
    expect(mapScanStatus("pending")).toBe("queued");
    expect(mapScanStatus("scanning")).toBe("running");
    expect(mapScanStatus("quick_done")).toBe("running");
    expect(mapScanStatus("processing")).toBe("running");
    expect(mapScanStatus("completed")).toBe("done");
    expect(mapScanStatus("failed")).toBe("failed");
  });
});

describe("deriveProblems", () => {
  it("returns an empty list for no pages", () => {
    expect(deriveProblems(null, null)).toEqual([]);
    expect(deriveProblems([], null)).toEqual([]);
  });

  it("keeps critical and major only, deduplicated, critical first, then by impact", () => {
    const pages = [
      page([
        issue({ id: "minor-1", severity: "minor", impact: 50 }),
        issue({ id: "major-low", severity: "major", impact: 3 }),
        issue({ id: "crit-a", severity: "critical", impact: 5 }),
        issue({ id: "major-high", severity: "major", impact: 9 }),
        issue({ id: "crit-a", severity: "critical", impact: 8, title: "higher impact copy" }),
        issue({ id: "info-1", severity: "info", impact: 40 }),
      ]),
    ];

    const problems = deriveProblems(pages, null);

    expect(problems.map((p) => p.key)).toEqual(["crit-a", "major-high", "major-low"]);
    expect(problems[0].title).toBe("higher impact copy");
  });

  it("ignores issues from pages after the homepage", () => {
    const pages = [
      page([issue({ id: "a", severity: "major", impact: 1 })]),
      page([issue({ id: "b", severity: "critical", impact: 9 })]),
    ];
    expect(deriveProblems(pages, null).map((p) => p.key)).toEqual(["a"]);
  });

  it("uses whyItMatters as detail and falls back to description", () => {
    const pages = [
      page([
        issue({ id: "a", severity: "critical", impact: 2, whyItMatters: "costs you calls" }),
        issue({ id: "b", severity: "critical", impact: 1 }),
      ]),
    ];
    expect(deriveProblems(pages, null)).toEqual([
      { key: "a", title: "title a", detail: "costs you calls" },
      { key: "b", title: "title b", detail: "description b" },
    ]);
  });

  it("prefers the Dutch text from issues_alt when its locale is nl", () => {
    const pages = [page([issue({ id: "a", severity: "major", impact: 1, whyItMatters: "english why" })])];
    const nl: IssuesAlt = { locale: "nl", byId: { a: { title: "Trage site", whyItMatters: "Bezoekers haken af" } } };
    const en: IssuesAlt = { locale: "en", byId: { a: { title: "ignored" } } };

    expect(deriveProblems(pages, nl)).toEqual([{ key: "a", title: "Trage site", detail: "Bezoekers haken af" }]);
    expect(deriveProblems(pages, en)).toEqual([{ key: "a", title: "title a", detail: "english why" }]);
  });
});

function fakeClient(pages: PageResult[]): SupabaseClient {
  const scan = {
    id: "s1",
    status: "completed",
    scores: { overall: 40 },
    pages,
    issues_alt: null,
    prospect_id: "p1",
  };
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === "scans" ? scan : { owner: "atrium" }, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("getAtriumScanStatus", () => {
  it("reports failed when the homepage carries a scan-error", async () => {
    const pages = [page([issue({ id: "scan-error", severity: "critical", impact: 100 })])];
    expect(await getAtriumScanStatus(fakeClient(pages), "s1")).toEqual({ status: "failed" });
  });

  it("stays done when only a later page failed, with homepage problems only", async () => {
    const pages = [
      page([issue({ id: "a", severity: "major", impact: 1 })]),
      page([
        issue({ id: "scan-error", severity: "critical", impact: 100 }),
        issue({ id: "b", severity: "critical", impact: 9 }),
      ]),
    ];
    const body = await getAtriumScanStatus(fakeClient(pages), "s1");
    expect(body?.status).toBe("done");
    expect(body?.problems?.map((p) => p.key)).toEqual(["a"]);
  });
});
