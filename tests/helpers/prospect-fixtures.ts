// Shared fixtures for integration tests that touch prospects and scans.
// Every integration test runs against the local Supabase stack only. These
// are Supabase's published local-only defaults, the same values the other
// *.integration.test.ts files set. They never work against a hosted project.
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkIds } from "@/lib/chunk-ids";
import type { IssuesAlt, PageResult, ScanScores } from "@/types/scanner";

export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
export const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/** Points createServerClient() at the local stack. Call at the top of a test file. */
export function useLocalSupabase(): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_ROLE_KEY;
}

export async function seedProspect(
  sb: SupabaseClient,
  fields: { domain: string; owner?: "scanner" | "atrium"; contactEmail?: string | null }
): Promise<string> {
  const { data, error } = await sb
    .from("prospects")
    .insert({
      domain: fields.domain,
      name: "Test Prospect",
      country: "NL",
      website_url: `https://${fields.domain}`,
      lifecycle_state: "new",
      owner: fields.owner ?? "scanner",
      contact_email: fields.contactEmail === undefined ? `info@${fields.domain}` : fields.contactEmail,
      contact_email_type: "generic",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function seedScan(
  sb: SupabaseClient,
  fields: {
    prospectId: string | null;
    status: string;
    scores?: ScanScores | null;
    pages?: PageResult[];
    issuesAlt?: IssuesAlt | null;
    errorMessage?: string | null;
  }
): Promise<string> {
  const { data, error } = await sb
    .from("scans")
    .insert({
      url: "https://example.com",
      domain: "example.com",
      type: "full",
      status: fields.status,
      scores: fields.scores ?? null,
      pages: fields.pages ?? [],
      issues_alt: fields.issuesAlt ?? null,
      error_message: fields.errorMessage ?? null,
      ip_hash: "test-atrium",
      prospect_id: fields.prospectId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * FK-safe cleanup. prospects.latest_scan_id and scans.prospect_id point at
 * each other (both NO ACTION) and outreach_messages.scan_id points at scans,
 * so the order is: null latest_scan_id, delete outreach_messages, delete
 * scans, delete prospects. Throws on any error so a failed cleanup is loud.
 */
export async function cleanupProspectsByDomainPrefix(sb: SupabaseClient, prefix: string): Promise<void> {
  const { data, error } = await sb.from("prospects").select("id").like("domain", `${prefix}%`);
  if (error) throw error;
  const ids = (data ?? []).map((row) => row.id as string);
  for (const chunk of chunkIds(ids, 100)) {
    const unlink = await sb.from("prospects").update({ latest_scan_id: null }).in("id", chunk);
    if (unlink.error) throw unlink.error;
    const drafts = await sb.from("outreach_messages").delete().in("prospect_id", chunk);
    if (drafts.error) throw drafts.error;
    const scans = await sb.from("scans").delete().in("prospect_id", chunk);
    if (scans.error) throw scans.error;
    const prospects = await sb.from("prospects").delete().in("id", chunk);
    if (prospects.error) throw prospects.error;
  }
}
