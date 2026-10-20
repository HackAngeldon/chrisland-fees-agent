/**
 * The school's fee rules and the balance arithmetic. Pure functions only:
 * no network, no clock (callers pass `today`), so every rule is testable.
 *
 * Modelled on Chrisland Schools' published rules (chrislandschools.com,
 * Tuition & Scholarships): fees are due on or before the first day of each
 * term, parents pay termly or annually, full and prompt annual payment earns
 * a discount, a registration fee is one-time and a caution fee refundable.
 * Amounts follow public reporting for a Lagos primary at that level (about
 * N1.3M first term, N900k later terms, N3.1M a year: Nairametrics, March
 * 2026). The instalment rule and the 5% discount are DEMO ASSUMPTIONS: the
 * school publishes neither, so a real launch confirms them with the bursar.
 */
import roster from "./data/roster.json" with { type: "json" };

export type Band = "nursery" | "primary" | "secondary";
export type TermId = "2026-27-T1" | "2026-27-T2" | "2026-27-T3";

export interface Term {
  id: TermId;
  name: string;
  starts: string; // YYYY-MM-DD, first day of term
  ends: string;
  /** Fees are due on or before the first day of term. */
  feesDue: string;
  /** A part-paid term must be cleared by this date (demo assumption). */
  clearBy: string;
}

export const SESSION = "2026/2027";
export const TERMS: Term[] = [
  { id: "2026-27-T1", name: "First term", starts: "2026-09-07", ends: "2026-12-11", feesDue: "2026-09-07", clearBy: "2026-10-30" },
  { id: "2026-27-T2", name: "Second term", starts: "2027-01-11", ends: "2027-04-01", feesDue: "2027-01-11", clearBy: "2027-02-12" },
  { id: "2026-27-T3", name: "Third term", starts: "2027-04-26", ends: "2027-07-16", feesDue: "2027-04-26", clearBy: "2027-05-28" },
];

/** Naira, whole numbers. Kobo only appears at the Paystack boundary. */
const TUITION: Record<Band, number> = { nursery: 750_000, primary: 900_000, secondary: 1_100_000 };
const DEVELOPMENT_LEVY: Record<Band, number> = { nursery: 150_000, primary: 250_000, secondary: 300_000 };
const BOOKS: Record<Band, number> = { nursery: 100_000, primary: 150_000, secondary: 200_000 };
const REGISTRATION = 50_000; // one-time, non-refundable, new students
const CAUTION = 100_000; // refundable, new students

export const POLICY = {
  /** Up to this many payments per term, then the rest is paid in one go. */
  maxPaymentsPerTerm: 2,
  /** Smallest part payment, unless it settles the balance. */
  minPartPayment: 100_000,
  annualDiscountPercent: 5,
  /** Days after the due date before an unpaid term counts as overdue in reminders. */
  graceDays: 0,
} as const;

export interface Parent { name: string; phone: string }

/**
 * The email Paystack needs for a payment. Invented, so no real parent is
 * written to: a plus address on TEST_INBOX when set (an inbox you own, so
 * any test receipt reaches you), otherwise a reserved example.com address.
 */
export function parentEmail(s: Student, testInbox = process.env.TEST_INBOX?.trim()): string {
  const family = s.parent.name.split(" ").pop()!.toLowerCase().replace(/[^a-z]/g, "");
  const m = testInbox?.match(/^([^@+\s]+)@([^@\s]+\.[^@\s]+)$/);
  return m ? `${m[1]}+chr-${family}@${m[2]}` : `parent.${family}@example.com`;
}
export interface RecordedPayment {
  term: TermId; amount: number; method: "bank_draft" | "paystack"; ref: string; date: string;
  /** Set on online payments (from the Paystack metadata); bank drafts live on the student already. */
  studentId?: string;
}
export interface Student {
  id: string; name: string; class: string; band: Band; campus: string;
  newStudent: boolean; scholarship: boolean; parent: Parent; payments: RecordedPayment[];
}

export const STUDENTS: Student[] = (roster as { students: Student[] }).students;

export interface FeeItem { label: string; amount: number; note?: string }

/** What a student is billed for one term. */
export function feeItems(s: Student, termId: TermId): FeeItem[] {
  const items: FeeItem[] = [];
  const first = termId === "2026-27-T1";
  items.push(s.scholarship
    ? { label: "Tuition", amount: 0, note: "Covered by the Chairman Scholarship" }
    : { label: "Tuition", amount: TUITION[s.band] });
  if (first) {
    items.push({ label: "Development levy", amount: DEVELOPMENT_LEVY[s.band] });
    items.push({ label: "Books and materials", amount: BOOKS[s.band] });
    if (s.newStudent) {
      items.push({ label: "Registration (one-time, non-refundable)", amount: REGISTRATION });
      items.push({ label: "Caution fee (refundable)", amount: CAUTION });
    }
  }
  return items;
}

export const termTotal = (s: Student, termId: TermId) => feeItems(s, termId).reduce((n, i) => n + i.amount, 0);

/** Normalise a Nigerian phone number to +234XXXXXXXXXX, or null. */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^234\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+234${digits}`;
  return null;
}

export const findStudent = (id: string) => STUDENTS.find((s) => s.id.toLowerCase() === id.trim().toLowerCase()) ?? null;

/**
 * The parent check every tool runs: the student ID and the phone number on
 * the school's record must belong together. One answer for every failure,
 * so the tool never confirms that a student ID exists.
 */
export function verifyParent(studentId: string, phone: string): { ok: true; student: Student; children: Student[] } | { ok: false } {
  const s = findStudent(studentId);
  const p = normalisePhone(phone);
  if (!s || !p || s.parent.phone !== p) return { ok: false };
  return { ok: true, student: s, children: STUDENTS.filter((c) => c.parent.phone === p) };
}

export const termById = (id: TermId) => TERMS.find((t) => t.id === id)!;

/** The term in session on `today`, or the next one between terms, or the last after the session. */
export function currentTerm(today: string): Term {
  return TERMS.find((t) => today <= t.ends) ?? TERMS[TERMS.length - 1];
}
export function nextTerm(t: Term): Term | null {
  const i = TERMS.findIndex((x) => x.id === t.id);
  return TERMS[i + 1] ?? null;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export type TermStatus = "paid" | "not_due" | "part_paid" | "overdue";

export interface TermBalance {
  term: Term;
  items: FeeItem[];
  total: number;
  payments: RecordedPayment[];
  paid: number;
  outstanding: number;
  status: TermStatus;
  /** When the outstanding amount is due: the term's due date, or the clear-by date once part-paid. */
  dueBy: string;
  daysOverdue: number;
  paymentsLeft: number;
}

/**
 * The balance for one term from the school's record (bank drafts) plus the
 * online payments Paystack confirmed. `online` must already be filtered to
 * successful transactions for this school.
 */
export function termBalance(s: Student, termId: TermId, online: RecordedPayment[], today: string): TermBalance {
  const term = termById(termId);
  const items = feeItems(s, termId);
  const total = items.reduce((n, i) => n + i.amount, 0);
  const payments = [...s.payments, ...online.filter((p) => p.studentId === s.id)].filter((p) => p.term === termId);
  const paid = payments.reduce((n, p) => n + p.amount, 0);
  const outstanding = Math.max(0, total - paid);
  const dueBy = paid > 0 && outstanding > 0 ? term.clearBy : term.feesDue;
  let status: TermStatus;
  if (outstanding === 0) status = "paid";
  else if (today < term.feesDue) status = "not_due";
  else if (paid > 0 && today <= term.clearBy) status = "part_paid";
  else status = "overdue";
  const daysOverdue = status === "overdue" ? Math.max(0, daysBetween(dueBy, today)) : 0;
  return { term, items, total, payments, paid, outstanding, status, dueBy, daysOverdue, paymentsLeft: Math.max(0, POLICY.maxPaymentsPerTerm - payments.length) };
}

export type PayChoice = "balance" | "part" | "next_term";

/** Whether a payment is allowed, and for how much. Every refusal says what the parent can do instead. */
export function planPayment(b: TermBalance, choice: PayChoice, amount?: number, next?: TermBalance | null):
  { ok: true; amount: number; termId: TermId; covers: string } | { ok: false; reason: string } {
  if (choice === "next_term") {
    if (!next) return { ok: false, reason: "There is no later term this session to pay ahead for." };
    if (b.outstanding > 0) return { ok: false, reason: `Please clear this term's balance first (${naira(b.outstanding)}), then you can pay ahead for ${next.term.name.toLowerCase()}.` };
    if (next.outstanding === 0) return { ok: false, reason: `${next.term.name} is already paid in full.` };
    return { ok: true, amount: next.outstanding, termId: next.term.id, covers: `${next.term.name} ${SESSION}, paid ahead` };
  }
  if (b.outstanding === 0) return { ok: false, reason: `${b.term.name} is already paid in full. Nothing is owed for it.` };
  if (choice === "balance") return { ok: true, amount: b.outstanding, termId: b.term.id, covers: `${b.term.name} ${SESSION}, full balance` };
  // Part payment.
  if (!amount || !Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "Tell me how much you would like to pay now." };
  const n = Math.round(amount);
  if (n > b.outstanding) return { ok: false, reason: `That is more than the balance. The most you can pay now is ${naira(b.outstanding)}.` };
  if (n === b.outstanding) return { ok: true, amount: n, termId: b.term.id, covers: `${b.term.name} ${SESSION}, full balance` };
  if (b.paymentsLeft <= 1) return { ok: false, reason: `This term allows ${POLICY.maxPaymentsPerTerm} payments and this would be the last, so it needs to clear the balance of ${naira(b.outstanding)}.` };
  if (n < POLICY.minPartPayment) return { ok: false, reason: `A part payment needs to be at least ${naira(POLICY.minPartPayment)}, or the full balance of ${naira(b.outstanding)}.` };
  return { ok: true, amount: n, termId: b.term.id, covers: `${b.term.name} ${SESSION}, part payment (${naira(b.outstanding - n)} left, due by ${b.term.clearBy})` };
}

export const fmt = (n: number) => n.toLocaleString("en-NG");
/** "₦1,300,000": how money reads in a WhatsApp message. */
export const naira = (n: number) => `₦${fmt(n)}`;
