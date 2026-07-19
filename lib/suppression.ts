import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDomain } from "@/lib/domain-normalize";

export type SuppressionReason = "bounced" | "complained" | "unsubscribe";
export type SuppressionSource = "resend_webhook" | "unsubscribe_link" | "backfill";

/**
 * CMP-01/03: true when an active (non-lifted) suppression row exists whose
 * email matches exactly OR whose domain matches the email's registrable
 * domain — one row blocks the whole domain, not just the exact address.
 * Lifted rows (lifted_at set) never match (D-09).
 */
export async function isSuppressed(sb: SupabaseClient, email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const domain = normalizeDomain(normalizedEmail);

  const query = sb.from("suppressions").select("id").is("lifted_at", null);

  const { data, error } = domain
    ? await query.or(`email.eq.${normalizedEmail},domain.eq.${domain}`).limit(1).maybeSingle()
    : await query.eq("email", normalizedEmail).limit(1).maybeSingle();

  if (error) throw error;
  return data !== null;
}

/**
 * CMP-04: idempotent write — a second call for an email that already has an
 * active row is a no-op that still reports success. D-07: pure lookup table,
 * never touches prospects. Check-then-write, not .upsert() (lib/prospect-upsert.ts
 * convention).
 */
export async function writeSuppression(
  sb: SupabaseClient,
  params: { email: string; domain: string | null; reason: SuppressionReason; source: SuppressionSource }
): Promise<{ created: boolean }> {
  const normalizedEmail = params.email.trim().toLowerCase();

  const { data: active, error: lookupError } = await sb
    .from("suppressions")
    .select("id")
    .eq("email", normalizedEmail)
    .is("lifted_at", null)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (active) return { created: false };

  const { error: insertError } = await sb.from("suppressions").insert({
    email: normalizedEmail,
    domain: params.domain,
    reason: params.reason,
    source: params.source,
  });
  if (insertError) throw insertError;

  return { created: true };
}

/**
 * D-08/D-09: lifts (never deletes) the active suppression row for an email —
 * the row stays forever as history; a later writeSuppression() call inserts
 * a fresh active row rather than failing.
 */
export async function liftSuppression(
  sb: SupabaseClient,
  params: { email: string; reason: string }
): Promise<{ lifted: boolean }> {
  const normalizedEmail = params.email.trim().toLowerCase();

  const { data: active, error: lookupError } = await sb
    .from("suppressions")
    .select("id")
    .eq("email", normalizedEmail)
    .is("lifted_at", null)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (!active) return { lifted: false };

  const { error: updateError } = await sb
    .from("suppressions")
    .update({ lifted_at: new Date().toISOString(), lifted_by_reason: params.reason })
    .eq("id", active.id);
  if (updateError) throw updateError;

  return { lifted: true };
}
