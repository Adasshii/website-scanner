import { createHmac, timingSafeEqual } from "node:crypto";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!secret) throw new Error("Missing UNSUBSCRIBE_TOKEN_SECRET");
  return secret;
}

/**
 * Mints a tamper-proof, permanent unsubscribe token for a prospect.
 *
 * Encodes only `prospectId` (a UUID) — never the raw email address, so the
 * token is safe to embed in a URL without leaking PII into server logs,
 * Referrer headers, or mail-client link prefetch (CMP-04). Carries no
 * expiry: an unsubscribe link must stay valid permanently (CMP-05).
 */
export function signUnsubscribeToken(prospectId: string): string {
  const secret = getSecret();
  const payload = b64url(JSON.stringify({ pid: prospectId }));
  const sig = b64url(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

/**
 * Verifies a token minted by signUnsubscribeToken. Returns the encoded
 * prospectId on success, or null on any tampered/malformed input — never
 * throws on bad input (only throws if the server secret itself is unset).
 */
export function verifyUnsubscribeToken(token: string): { prospectId: string } | null {
  const secret = getSecret();
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = b64url(createHmac("sha256", secret).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const { pid } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof pid === "string" ? { prospectId: pid } : null;
  } catch {
    return null;
  }
}
