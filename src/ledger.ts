/**
 * Online payments, read from Paystack itself: Paystack is the ledger for
 * everything paid through the agent, so there is no second database to fall
 * out of step with it. Bank drafts the accounts office already cleared live
 * on the student record (src/data/roster.json).
 *
 * A transaction belongs to this school when its metadata carries our tag;
 * anything else on the same Paystack account is ignored.
 */
import { listSuccessful, type Transaction } from "./paystack.js";
import { TERMS, type RecordedPayment, type TermId } from "./school.js";

export const SCHOOL_TAG = "chrisland-demo";
/** The session's fees can only have been paid from here on. */
const SESSION_OPENED = "2026-08-01T00:00:00.000Z";
const CACHE_MS = 10_000;
let cache: { at: number; list: RecordedPayment[] } | null = null;

function meta(t: Transaction): Record<string, unknown> {
  if (!t.metadata) return {};
  if (typeof t.metadata === "string") { try { return JSON.parse(t.metadata) as Record<string, unknown>; } catch { return {}; } }
  return t.metadata;
}

/** A successful Paystack transaction as a payment on a student's term, or null when it is not ours. */
export function toRecorded(t: Transaction): RecordedPayment | null {
  const m = meta(t);
  const term = m.term as TermId | undefined;
  if (t.status !== "success" || m.school !== SCHOOL_TAG || typeof m.student_id !== "string" || !TERMS.some((x) => x.id === term)) return null;
  if (t.currency && t.currency !== "NGN") return null;
  return { term: term!, amount: Math.round(t.amount / 100), method: "paystack", ref: t.reference, date: (t.paid_at ?? "").slice(0, 10), studentId: m.student_id };
}

export async function onlinePayments(fresh = false): Promise<RecordedPayment[]> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.list;
  const list = (await listSuccessful(SESSION_OPENED)).map(toRecorded).filter((p): p is RecordedPayment => p !== null);
  cache = { at: Date.now(), list };
  return list;
}

/** After a payment is confirmed, the next balance read must include it. */
export function forgetCache() { cache = null; }
