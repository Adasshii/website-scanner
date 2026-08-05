/**
 * lib/outreach-isolation.test.ts — Phase 8, SND-01 / SND-03 / SND-04. This
 * file turns three prose claims that were true only by argument (D-01: no
 * third-party dispatch provider, manual send only) into failing builds, so
 * they stay true after this phase closes and nobody remembers why.
 *
 * What breaks if this file starts failing and someone "fixes" it by
 * loosening an assertion rather than the code: the outreach path would be
 * free to import lib/email.ts (or Resend, or any mail-sending package)
 * directly, and any bug in outreach code — a bad loop, a leaked credential,
 * an unhandled exception mid-batch — could take down the public scanner's
 * live, revenue-earning transactional mail alongside it. This test is the
 * separation between "an outreach bug" and "the whole product's mail is
 * down", asserted structurally rather than by convention.
 *
 * This file is a pure source-and-config assertion. It reads files from disk
 * with node:fs, opens no database connection, and starts no server, so it
 * belongs to the "unit" vitest project and runs on every `npx vitest run`.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Every file that participates in producing or dispatching an outreach
 * message: the four Phase 8 lib modules, the Phase 6 drafting/queue
 * modules, and the three admin routes. Asserted to exist before anything
 * else runs, so a rename shrinks this set loudly (a failing test) instead
 * of silently (a guard that quietly checks fewer files than it claims to).
 */
const OUTREACH_PATH_FILES = [
  "lib/send-gate.ts",
  "lib/opt-out-link.ts",
  "lib/send-record.ts",
  "lib/send-audit.ts",
  "lib/outreach-queue.ts",
  "lib/draft-generator.ts",
  "lib/draft-prompt.ts",
  "lib/draft-metric-selector.ts",
  "lib/draft-on-scan-complete.ts",
  "app/api/admin/outreach/route.ts",
  "app/api/admin/outreach/send/route.ts",
  "app/api/admin/outreach/audit/route.ts",
];

/**
 * SND-03: the public scanner's transactional mail (lib/email.ts, backed by
 * Resend) is a working, revenue-earning system. This list is what keeps an
 * outreach failure from reaching it — no outreach-path file may reference
 * any of these, in code (comments are stripped before matching, see below).
 */
const BANNED_MAIL_TOKENS = [
  'from "resend"',
  'require("resend")',
  "@/lib/email",
  "nodemailer",
  "createTransport",
  "smtp.",
];

/**
 * SND-01: no dispatch channel may enter by install. None of these may
 * appear as a key in package.json's dependencies or devDependencies.
 */
const BANNED_MAIL_PACKAGES = ["nodemailer", "@sendgrid/mail", "mailgun.js", "@aws-sdk/client-ses", "postmark"];

/** Line-comment marker. A trimmed line starting with this is dropped before matching. */
const LINE_COMMENT_MARKER = "//";
/** Block-comment continuation marker: JSDoc-style ` * ...` lines, and a bare open or close mark on its own line. */
const BLOCK_COMMENT_CONTINUATION_MARKER = "*";

/**
 * Drops every line whose trimmed form begins with a line-comment marker or
 * a block-comment continuation marker. Every file in OUTREACH_PATH_FILES is
 * expected to explain, in its own header comments, why it avoids these
 * dependencies (see lib/send-gate.ts's header, for one) — a matcher that
 * read comments would fail on its own documentation.
 */
function stripCommentLines(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) => line.length > 0 && !line.startsWith(LINE_COMMENT_MARKER) && !line.startsWith(BLOCK_COMMENT_CONTINUATION_MARKER)
    );
}

function readOutreachFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

describe("outreach path isolation (SND-01, SND-03, SND-04)", () => {
  it("every file in OUTREACH_PATH_FILES exists on disk", () => {
    for (const relativePath of OUTREACH_PATH_FILES) {
      expect(existsSync(path.join(process.cwd(), relativePath)), `missing: ${relativePath}`).toBe(true);
    }
  });

  it(
    "SND-03: no non-comment line in any outreach-path file references a banned mail token — the public scanner's " +
      "transactional mail (lib/email.ts, Resend) is never reachable from the outreach path",
    () => {
      for (const relativePath of OUTREACH_PATH_FILES) {
        const codeLines = stripCommentLines(readOutreachFile(relativePath));
        for (const token of BANNED_MAIL_TOKENS) {
          const offendingLine = codeLines.find((line) => line.includes(token));
          expect(offendingLine, `${relativePath} references banned token "${token}": ${offendingLine}`).toBeUndefined();
        }
      }
    }
  );

  it(
    "SND-01: no dispatch-provider package is installed, and the public scanner's own mail dependency survives",
    () => {
      const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const dependencyNames = [
        ...Object.keys(packageJson.dependencies ?? {}),
        ...Object.keys(packageJson.devDependencies ?? {}),
      ];

      for (const bannedPackage of BANNED_MAIL_PACKAGES) {
        expect(dependencyNames, `${bannedPackage} must not be installed`).not.toContain(bannedPackage);
      }

      // This must NOT be satisfied by deleting the public scanner's mail
      // capability — that would be a regression, not a fix.
      expect(Object.keys(packageJson.dependencies ?? {})).toContain("resend");
    }
  );

  it("SND-04: the written acceptable-use verification artifact exists and still records the manual-send decision", () => {
    const artifactPath = path.join(process.cwd(), ".planning/research/SEND-CHANNEL.md");
    expect(existsSync(artifactPath)).toBe(true);

    const content = readFileSync(artifactPath, "utf-8");
    expect(content).toContain("Status: superseded by the manual-send decision");
    expect(content).toContain("There is no third-party dispatch provider");
  });
});
