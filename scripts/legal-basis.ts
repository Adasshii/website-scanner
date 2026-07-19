/**
 * scripts/legal-basis.ts — resolves "which legal basis applies to this
 * prospect, and is it suppressed" in one output (D-10, CMP-08/CMP-16).
 * Same CLI shape as scripts/import-prospects.ts. The regime is ALWAYS read
 * from the legal_regimes config table — this file must never branch on a
 * hardcoded country code (CMP-16); adding a country is a data change, not a
 * code change.
 *
 * Usage:
 *   npx tsx scripts/legal-basis.ts --email=<address>
 *   npx tsx scripts/legal-basis.ts --domain=<domain>
 */
import { parseArgs } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSuppressed } from "@/lib/suppression";
import { createServerClient } from "@/lib/supabase";
import { normalizeDomain } from "@/lib/domain-normalize";

const USAGE = "Usage: npx tsx scripts/legal-basis.ts --email=<address> | --domain=<domain>";

export class LegalBasisArgsError extends Error {}

export interface LegalBasisArgs {
  email: string | null;
  domain: string | null;
}

/**
 * Parses and validates CLI args. At least one of --email or --domain is
 * REQUIRED, checked synchronously before any lookup runs.
 */
export function parseLegalBasisArgs(argv: string[]): LegalBasisArgs {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        email: { type: "string" },
        domain: { type: "string" },
      },
      strict: true,
    });

    if (!values.email && !values.domain) {
      throw new LegalBasisArgsError(`${USAGE}\n\nMissing required flag: --email or --domain`);
    }

    return {
      email: (values.email as string | undefined) ?? null,
      domain: (values.domain as string | undefined) ?? null,
    };
  } catch (err) {
    if (err instanceof LegalBasisArgsError) throw err;
    throw new LegalBasisArgsError(`${USAGE}\n\n${(err as Error).message}`);
  }
}

// ── Dependency seams (testable without a live Supabase) ────────────────────

export interface ProspectLookupResult {
  country: string;
  domain: string | null;
  contactEmail: string | null;
}

export interface LegalRegimeRow {
  countryCode: string;
  spamLawRegime: string;
  notesUrl: string | null;
  currentLiaVersion: number;
}

export interface LiaVersionRow {
  version: number;
  effectiveFrom: string;
  contentHash: string;
}

export interface LegalBasisDeps {
  createServerClient: () => SupabaseClient;
  isSuppressed: (sb: SupabaseClient, email: string) => Promise<boolean>;
  lookupProspect: (
    sb: SupabaseClient,
    input: { email: string | null; domain: string | null }
  ) => Promise<ProspectLookupResult | null>;
  lookupLegalRegime: (sb: SupabaseClient, countryCode: string) => Promise<LegalRegimeRow | null>;
  lookupLiaVersion: (sb: SupabaseClient, version: number) => Promise<LiaVersionRow | null>;
}

/**
 * Domain match takes priority (mirrors the importer's identity model,
 * migration 010); falls back to an exact contact_email match so a
 * no-website prospect (domain IS NULL) still resolves.
 */
async function defaultLookupProspect(
  sb: SupabaseClient,
  { email, domain }: { email: string | null; domain: string | null }
): Promise<ProspectLookupResult | null> {
  if (domain) {
    const { data, error } = await sb
      .from("prospects")
      .select("country, domain, contact_email")
      .eq("domain", domain)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      return { country: data.country, domain: data.domain, contactEmail: data.contact_email };
    }
  }
  if (email) {
    const { data, error } = await sb
      .from("prospects")
      .select("country, domain, contact_email")
      .eq("contact_email", email.trim().toLowerCase())
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      return { country: data.country, domain: data.domain, contactEmail: data.contact_email };
    }
  }
  return null;
}

/** Reads the per-country config row (CMP-16) — no code branch, only a query. */
async function defaultLookupLegalRegime(
  sb: SupabaseClient,
  countryCode: string
): Promise<LegalRegimeRow | null> {
  const { data, error } = await sb
    .from("legal_regimes")
    .select("country_code, spam_law_regime, notes_url, current_lia_version")
    .eq("country_code", countryCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    countryCode: data.country_code,
    spamLawRegime: data.spam_law_regime,
    notesUrl: data.notes_url,
    currentLiaVersion: data.current_lia_version,
  };
}

async function defaultLookupLiaVersion(
  sb: SupabaseClient,
  version: number
): Promise<LiaVersionRow | null> {
  const { data, error } = await sb
    .from("lia_versions")
    .select("version, effective_from, content_hash")
    .eq("version", version)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { version: data.version, effectiveFrom: data.effective_from, contentHash: data.content_hash };
}

const defaultDeps: LegalBasisDeps = {
  createServerClient,
  isSuppressed,
  lookupProspect: defaultLookupProspect,
  lookupLegalRegime: defaultLookupLegalRegime,
  lookupLiaVersion: defaultLookupLiaVersion,
};

// ── Orchestration ───────────────────────────────────────────────────────────

export interface LegalBasisResult {
  input: string;
  country: string | null;
  spamLawRegime: string | null;
  notesUrl: string | null;
  liaVersion: number | null;
  liaEffectiveFrom: string | null;
  liaContentHash: string | null;
  suppressed: boolean;
}

/**
 * Resolves domain-or-email -> prospect country -> legal_regimes row ->
 * current lia_versions row, plus suppression status, and prints it all as
 * one consolidated output block (D-10).
 */
export async function runLegalBasis(
  args: LegalBasisArgs,
  deps: LegalBasisDeps = defaultDeps
): Promise<LegalBasisResult> {
  const input = args.email ?? args.domain ?? "";
  // Registrable-domain normalisation (lib/domain-normalize.ts) — the same
  // helper used everywhere else in this codebase, never a second normaliser.
  const domain = normalizeDomain(input);

  const sb = deps.createServerClient();
  const prospect = await deps.lookupProspect(sb, { email: args.email, domain });

  const country = prospect?.country ?? null;
  const regime = country ? await deps.lookupLegalRegime(sb, country) : null;
  const liaVersion = regime ? await deps.lookupLiaVersion(sb, regime.currentLiaVersion) : null;

  // Suppression status: the exact email when given, else the resolved
  // prospect's contact email, else the domain itself — isSuppressed matches
  // on domain via its own OR clause either way, so a domain-only lookup
  // still reports domain-wide suppression correctly.
  const suppressionInput = args.email ?? prospect?.contactEmail ?? domain ?? "";
  const suppressed = suppressionInput ? await deps.isSuppressed(sb, suppressionInput) : false;

  const result: LegalBasisResult = {
    input,
    country,
    spamLawRegime: regime?.spamLawRegime ?? null,
    notesUrl: regime?.notesUrl ?? null,
    liaVersion: liaVersion?.version ?? null,
    liaEffectiveFrom: liaVersion?.effectiveFrom ?? null,
    liaContentHash: liaVersion?.contentHash ?? null,
    suppressed,
  };

  console.log(`[legal-basis] ${input}`);
  console.log(`  country:          ${result.country ?? "unknown (no matching prospect)"}`);
  console.log(`  spam_law_regime:  ${result.spamLawRegime ?? "unknown (no legal_regimes row)"}`);
  console.log(`  notes_url:        ${result.notesUrl ?? "n/a"}`);
  console.log(
    `  LIA version:      ${result.liaVersion ?? "unknown"}` +
      (result.liaEffectiveFrom
        ? ` (effective ${result.liaEffectiveFrom}, hash ${result.liaContentHash})`
        : "")
  );
  console.log(`  suppressed:       ${result.suppressed}`);

  return result;
}

/**
 * Parses argv then runs the lookup — the exact sequence main() uses. Exposed
 * separately so tests can assert a missing-arg run never reaches
 * createServerClient (parseLegalBasisArgs throws synchronously first).
 */
export async function runCli(
  argv: string[],
  deps: LegalBasisDeps = defaultDeps
): Promise<LegalBasisResult> {
  const args = parseLegalBasisArgs(argv);
  return runLegalBasis(args, deps);
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

function loadLocalEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // Missing file, or already-exported env vars are sufficient — ignore.
    }
  }
}

async function main(): Promise<void> {
  loadLocalEnv();

  try {
    await runCli(process.argv.slice(2));
  } catch (err) {
    if (err instanceof LegalBasisArgsError) {
      console.error(err.message);
      process.exit(1);
      return;
    }
    throw err;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
