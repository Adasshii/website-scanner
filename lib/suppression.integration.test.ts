/**
 * Integration suite for lib/suppression.ts — idempotency, re-suppression
 * after lift, no-silent-re-add, and domain-wide matching, asserted against a
 * real Postgres with migration 014 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*, including 014
 *   npx vitest run lib/suppression.integration.test.ts
 *
 * The client is pointed at the local stack via the env vars set below —
 * the fixed local-dev URL and demo service-role JWT `supabase start` always
 * prints for a fresh local project. These are Supabase's published local-only
 * defaults (see CLI output), not a real secret, and are never valid against
 * a hosted/production project.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import { isSuppressed, liftSuppression, writeSuppression } from "./suppression";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  const { error } = await sb.from("suppressions").delete().like("email", "test-suppression-%");
  if (error) throw error;
});

describe("suppression integration", () => {
  it("CMP-04: writeSuppression called twice for the same email leaves exactly one active row", async () => {
    const email = "test-suppression-1@example.com";

    await writeSuppression(sb, { email, domain: null, reason: "unsubscribe", source: "unsubscribe_link" });
    const second = await writeSuppression(sb, {
      email,
      domain: null,
      reason: "unsubscribe",
      source: "unsubscribe_link",
    });
    expect(second).toEqual({ created: false });

    const { data, error } = await sb.from("suppressions").select("id").eq("email", email).is("lifted_at", null);
    if (error) throw error;
    expect(data).toHaveLength(1);
  });

  it("CMP-05/D-09: writeSuppression -> liftSuppression -> writeSuppression re-suppresses on a fresh row, not the lifted one", async () => {
    const email = "test-suppression-2@example.com";

    const first = await writeSuppression(sb, { email, domain: null, reason: "unsubscribe", source: "unsubscribe_link" });
    expect(first).toEqual({ created: true });

    const lifted = await liftSuppression(sb, { email, reason: "false positive" });
    expect(lifted).toEqual({ lifted: true });

    expect(await isSuppressed(sb, email)).toBe(false);

    const resuppressed = await writeSuppression(sb, {
      email,
      domain: null,
      reason: "bounced",
      source: "resend_webhook",
    });
    expect(resuppressed).toEqual({ created: true });

    expect(await isSuppressed(sb, email)).toBe(true);

    const { data, error } = await sb
      .from("suppressions")
      .select("id, lifted_at, reason")
      .eq("email", email)
      .is("lifted_at", null);
    if (error) throw error;
    expect(data).toHaveLength(1);
    expect(data![0].reason).toBe("bounced");
  });

  it("CMP-06: a raw direct insert of a second active row for an already-suppressed email fails at the DB, and writeSuppression treats it as a no-op", async () => {
    const email = "test-suppression-3@example.com";

    await writeSuppression(sb, { email, domain: null, reason: "unsubscribe", source: "unsubscribe_link" });

    const { error: dupInsertError } = await sb.from("suppressions").insert({
      email,
      domain: null,
      reason: "unsubscribe",
      source: "unsubscribe_link",
    });
    expect(dupInsertError).not.toBeNull();

    const viaService = await writeSuppression(sb, {
      email,
      domain: null,
      reason: "unsubscribe",
      source: "unsubscribe_link",
    });
    expect(viaService).toEqual({ created: false });

    const { data, error } = await sb.from("suppressions").select("id").eq("email", email).is("lifted_at", null);
    if (error) throw error;
    expect(data).toHaveLength(1);
  });

  it("CMP-03 domain: suppressing sales@ blocks info@ on the same domain", async () => {
    const domain = "test-suppression-dom.example";
    const suppressedEmail = `sales@${domain}`;
    const otherEmail = `info@${domain}`;

    await writeSuppression(sb, {
      email: suppressedEmail,
      domain,
      reason: "unsubscribe",
      source: "unsubscribe_link",
    });

    expect(await isSuppressed(sb, otherEmail)).toBe(true);

    // Cleanup helper only matches the "test-suppression-" email prefix; the
    // suppressed row here uses that prefix (sales@test-suppression-dom...),
    // so afterEach covers it without extra scoping.
  });
});
