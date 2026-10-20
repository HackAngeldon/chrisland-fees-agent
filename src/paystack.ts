/**
 * The few Paystack calls the agent needs, in TEST MODE ONLY: a live secret
 * key is refused before any request is made (the exercise allows test keys
 * only, and a fees bot must never be one env var away from charging real
 * parents by accident).
 *
 * Every failure becomes a PaystackError with a `kind` the tools can explain
 * to a parent in plain words. Reads retry once on a timeout or a 5xx;
 * creating a payment never retries, because a retry after a timeout can
 * create a second transaction or trip Paystack's duplicate-reference rule.
 */
const BASE = "https://api.paystack.co";
const TIMEOUT_MS = 10_000;

export type PaystackErrorKind = "not_configured" | "live_key" | "auth" | "bad_request" | "not_found" | "unavailable" | "timeout";

export class PaystackError extends Error {
  constructor(public kind: PaystackErrorKind, message: string, public status?: number) {
    super(message);
    this.name = "PaystackError";
  }
}

type FetchFn = typeof fetch;
let fetchImpl: FetchFn = (...a) => fetch(...a);
/** Tests swap the network for a fake. */
export function setFetch(f: FetchFn | null) { fetchImpl = f ?? ((...a) => fetch(...a)); }

function secretKey(): string {
  const k = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!k) throw new PaystackError("not_configured", "PAYSTACK_SECRET_KEY is not set.");
  if (!k.startsWith("sk_test_")) throw new PaystackError("live_key", "Only Paystack test keys (sk_test_...) are accepted.");
  return k;
}

interface Envelope<T> { status: boolean; message: string; data: T }

async function call<T>(path: string, init: RequestInit = {}, retries = 0): Promise<T> {
  const key = secretKey();
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    if (retries > 0) return call<T>(path, init, retries - 1);
    throw new PaystackError(timedOut ? "timeout" : "unavailable", timedOut ? "Paystack did not answer in time." : "Could not reach Paystack.");
  }
  let body: Envelope<T> | null = null;
  try { body = await res.json() as Envelope<T>; } catch { /* non-JSON error page */ }
  if (res.ok && body?.status) return body.data;
  const msg = body?.message ?? `Paystack answered ${res.status}.`;
  if (res.status === 401) throw new PaystackError("auth", msg, 401);
  if (res.status === 404) throw new PaystackError("not_found", msg, 404);
  if (res.status >= 500) {
    if (retries > 0) return call<T>(path, init, retries - 1);
    throw new PaystackError("unavailable", msg, res.status);
  }
  throw new PaystackError("bad_request", msg, res.status);
}

export interface InitResult { authorization_url: string; access_code: string; reference: string }

export function initializePayment(p: {
  email: string; amountKobo: number; reference: string; callbackUrl?: string; metadata: Record<string, unknown>;
}): Promise<InitResult> {
  return call<InitResult>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: p.email, amount: p.amountKobo, currency: "NGN", reference: p.reference,
      callback_url: p.callbackUrl, metadata: p.metadata,
      channels: ["card", "bank", "bank_transfer", "ussd"],
    }),
  });
}

export interface Transaction {
  id: number;
  reference: string;
  /** success | failed | abandoned | ongoing | pending | processing | queued | reversed */
  status: string;
  amount: number; // kobo
  currency: string;
  paid_at: string | null;
  created_at?: string;
  channel: string | null;
  gateway_response: string | null;
  metadata: Record<string, unknown> | string | null;
}

export const verifyPayment = (reference: string) =>
  call<Transaction>(`/transaction/verify/${encodeURIComponent(reference)}`, {}, 1);

/** Successful transactions since `from` (ISO date), newest first, up to `pages` x 100. */
export async function listSuccessful(from: string, pages = 3): Promise<Transaction[]> {
  const out: Transaction[] = [];
  for (let page = 1; page <= pages; page++) {
    const batch = await call<Transaction[]>(`/transaction?status=success&perPage=100&page=${page}&from=${encodeURIComponent(from)}`, {}, 1);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body, keyed with the secret key. */
export async function webhookSignatureValid(rawBody: string, signature: string | undefined): Promise<boolean> {
  if (!signature) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
