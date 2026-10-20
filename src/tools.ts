/**
 * The MCP tools, in two sets on two endpoints (src/server.ts):
 *
 *  - parents (/mcp/parents): verify_parent, get_fee_balance,
 *    create_payment_link, check_payment. Every call that touches a child's
 *    money carries the student ID and the parent's registered phone number,
 *    because the server keeps no session and Chord does not document passing
 *    the WhatsApp sender to tools.
 *  - bursar (/mcp/bursar): outstanding_report. Registered in Chord as a
 *    separate server with its own token and assigned only to the bursar's
 *    teammate, so a parent cannot talk the parents' agent into listing other
 *    families' balances: the tool is simply not there.
 *
 * Results are compact JSON the model reads, with the words to say to the
 * parent already in them where a refusal or failure needs explaining.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  POLICY, SESSION, STUDENTS, currentTerm, naira, nextTerm, parentEmail, planPayment, termBalance, verifyParent,
  type Student, type TermBalance, type TermId,
} from "./school.js";
import { PaystackError, initializePayment, verifyPayment } from "./paystack.js";
import { SCHOOL_TAG, forgetCache, onlinePayments, toRecorded } from "./ledger.js";
import { capture } from "./capture.js";

/** Today in Lagos as YYYY-MM-DD. DEMO_TODAY pins it for tests and the recording. */
export function today(): string {
  // An empty DEMO_TODAY (as .env.example ships it) means "not pinned", not "the empty date".
  const pinned = process.env.DEMO_TODAY?.trim();
  if (pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned)) return pinned;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
}

type Json = Record<string, unknown>;
const reply = (data: Json) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

/** What a parent hears when Paystack is the problem. Never the raw error, never a key. */
function paystackTrouble(e: unknown): Json {
  const kind = e instanceof PaystackError ? e.kind : "unavailable";
  console.error("[paystack]", kind, e instanceof Error ? e.message : e);
  if (kind === "not_configured" || kind === "live_key" || kind === "auth") {
    return { ok: false, error: "payments_not_set_up", say: "Online payment is not available right now. I have let the accounts office know; please try again later today.", escalate: true };
  }
  return { ok: false, error: "payment_service_unavailable", say: "The payment service is not answering right now. Please try again in a few minutes.", escalate: false };
}

/* Failed verifications per student ID: after 5 in 15 minutes, stop answering for that ID. */
const failures = new Map<string, { n: number; since: number }>();
const LOCK_AFTER = 5, LOCK_MS = 15 * 60_000;
function locked(studentId: string): boolean {
  const f = failures.get(studentId.toLowerCase());
  if (!f) return false;
  if (Date.now() - f.since > LOCK_MS) { failures.delete(studentId.toLowerCase()); return false; }
  return f.n >= LOCK_AFTER;
}
function noteFailure(studentId: string) {
  const k = studentId.toLowerCase();
  const f = failures.get(k);
  if (!f || Date.now() - f.since > LOCK_MS) failures.set(k, { n: 1, since: Date.now() });
  else f.n += 1;
}

const NOT_MATCHED: Json = {
  verified: false,
  say: "That student ID and phone number do not match the school's records. Please check the student ID on the fee bill or report card, and use the phone number you registered with the school.",
};
const LOCKED: Json = {
  verified: false, locked: true,
  say: "For the family's security I cannot check this student's fees here for the next 15 minutes. Please contact the accounts office.",
  escalate: true,
};

function check(studentId: string, phone: string): { ok: true; student: Student; children: Student[] } | { ok: false; out: Json } {
  if (locked(studentId)) return { ok: false, out: LOCKED };
  const v = verifyParent(studentId, phone);
  if (!v.ok) { noteFailure(studentId); return { ok: false, out: NOT_MATCHED }; }
  return v;
}

const termView = (b: TermBalance) => ({
  term: b.term.name, term_id: b.term.id, starts: b.term.starts, closes: b.term.ends, fees_due: b.term.feesDue,
  items: b.items.map((i) => ({ label: i.label, amount: naira(i.amount), ...(i.note ? { note: i.note } : {}) })),
  total: naira(b.total), paid: naira(b.paid),
  payments: b.payments.map((p) => ({ amount: naira(p.amount), method: p.method === "bank_draft" ? "bank draft" : "online (Paystack)", date: p.date, ref: p.ref })),
  outstanding: naira(b.outstanding), outstanding_naira: b.outstanding,
  status: b.status, due_by: b.dueBy, days_overdue: b.daysOverdue,
  payments_left_this_term: b.paymentsLeft,
});

const StudentId = z.string().min(3).max(20).describe("The student ID on the fee bill or report card, e.g. CHR-1042.");
const Phone = z.string().min(7).max(20).describe("The parent's phone number as registered with the school, in any format (0803..., +234803...).");

export function registerParentTools(server: McpServer) {
  server.registerTool("verify_parent", {
    title: "Verify the parent",
    description: "Check that a student ID and the parent's registered phone number belong together, before sharing any fees information. Returns the parent's children at the school (siblings included). Call this first in every conversation about fees.",
    inputSchema: { student_id: StudentId, phone: Phone },
    annotations: { readOnlyHint: true },
  }, async ({ student_id, phone }, extra) => {
    capture("verify_parent", extra);
    const v = check(student_id, phone);
    if (!v.ok) return reply(v.out);
    return reply({
      verified: true,
      parent_first_name: v.student.parent.name.split(" ")[0],
      children: v.children.map((c) => ({ student_id: c.id, name: c.name, class: c.class, campus: c.campus })),
    });
  });

  server.registerTool("get_fee_balance", {
    title: "Get a student's fee balance",
    description: "The current term's fees for one student: what was billed, what was paid (bank drafts and online), what is outstanding, the status (paid, not_due, part_paid, overdue) and the due date, plus next term's amount and the part-payment rules. Needs the same student ID and phone number as verify_parent.",
    inputSchema: { student_id: StudentId, phone: Phone },
    annotations: { readOnlyHint: true },
  }, async ({ student_id, phone }, extra) => {
    capture("get_fee_balance", extra);
    const v = check(student_id, phone);
    if (!v.ok) return reply(v.out);
    let online: Awaited<ReturnType<typeof onlinePayments>> = [];
    let onlineChecked = true;
    try { online = await onlinePayments(); } catch (e) { onlineChecked = false; paystackTrouble(e); }
    const day = today();
    const term = currentTerm(day);
    const b = termBalance(v.student, term.id, online, day);
    const nt = nextTerm(term);
    const nb = nt ? termBalance(v.student, nt.id, online, day) : null;
    return reply({
      student: { student_id: v.student.id, name: v.student.name, class: v.student.class, campus: v.student.campus },
      session: SESSION, today: day,
      current_term: termView(b),
      next_term: nb ? { term: nb.term.name, term_id: nb.term.id, fees_due: nb.term.feesDue, total: naira(nb.total), outstanding: naira(nb.outstanding) } : null,
      part_payment_rules: {
        max_payments_per_term: POLICY.maxPaymentsPerTerm, min_part_payment: naira(POLICY.minPartPayment),
        clear_by: b.term.clearBy, note: "A part-paid term must be cleared by the clear-by date.",
      },
      annual_discount: {
        percent: POLICY.annualDiscountPercent,
        rule: "Paying the whole session's fees in full by the first day of first term earns the discount.",
        open_now: day < term.feesDue && term.id === "2026-27-T1",
      },
      ...(onlineChecked ? {} : { warning: "Online payments could not be checked just now, so this balance may not include a payment made in the last few minutes." }),
    });
  });

  server.registerTool("create_payment_link", {
    title: "Create a Paystack payment link",
    description: "Create a one-off Paystack payment link (test mode) for a verified parent. pay='balance' pays the current term's outstanding balance; pay='part' pays amount_naira now (part-payment rules apply); pay='next_term' pays next term ahead, allowed once this term is clear. Returns the link to send to the parent and a reference to check later. Never invent a link: only send the one this tool returns.",
    inputSchema: {
      student_id: StudentId, phone: Phone,
      pay: z.enum(["balance", "part", "next_term"]),
      amount_naira: z.number().positive().optional().describe("Only for pay='part': the amount in naira, e.g. 300000."),
    },
  }, async ({ student_id, phone, pay, amount_naira }, extra) => {
    capture("create_payment_link", extra);
    const v = check(student_id, phone);
    if (!v.ok) return reply(v.out);
    let online;
    try { online = await onlinePayments(true); } catch (e) { return reply(paystackTrouble(e)); }
    const day = today();
    const term = currentTerm(day);
    const b = termBalance(v.student, term.id, online, day);
    const nt = nextTerm(term);
    const plan = planPayment(b, pay, amount_naira, nt ? termBalance(v.student, nt.id, online, day) : null);
    if (!plan.ok) return reply({ ok: false, error: "not_allowed", say: plan.reason });
    const short = plan.termId.slice(-2); // T1, T2, T3
    const reference = `${v.student.id}-${short}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    try {
      const r = await initializePayment({
        email: parentEmail(v.student),
        amountKobo: plan.amount * 100,
        reference,
        callbackUrl: process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/paid` : undefined,
        metadata: {
          school: SCHOOL_TAG, student_id: v.student.id, term: plan.termId, purpose: "school_fees",
          custom_fields: [
            { display_name: "Student", variable_name: "student", value: `${v.student.name} (${v.student.id})` },
            { display_name: "Class", variable_name: "class", value: `${v.student.class}, ${v.student.campus}` },
            { display_name: "For", variable_name: "covers", value: plan.covers },
          ],
        },
      });
      return reply({ ok: true, link: r.authorization_url, reference: r.reference, amount: naira(plan.amount), covers: plan.covers,
        note: "Test mode: no real money moves. The link is for this amount only." });
    } catch (e) {
      return reply(paystackTrouble(e));
    }
  });

  server.registerTool("check_payment", {
    title: "Check a payment",
    description: "Ask Paystack whether a payment went through, by the reference create_payment_link returned. On success returns the receipt and the new balance. Use it when the parent says they have paid; never confirm a payment without it.",
    inputSchema: { reference: z.string().min(6).max(80) },
    annotations: { readOnlyHint: true },
  }, async ({ reference }, extra) => {
    capture("check_payment", extra);
    let t;
    try { t = await verifyPayment(reference.trim()); }
    catch (e) {
      if (e instanceof PaystackError && (e.kind === "not_found" || e.kind === "bad_request")) {
        return reply({ paid: false, state: "not_found", say: "I cannot find a payment with that reference. Please copy it exactly from the payment message." });
      }
      return reply(paystackTrouble(e));
    }
    const m = (typeof t.metadata === "object" && t.metadata) ? t.metadata as Record<string, unknown> : {};
    if (m.school !== SCHOOL_TAG) return reply({ paid: false, state: "not_found", say: "I cannot find a school fees payment with that reference." });
    const student = STUDENTS.find((s) => s.id === m.student_id);
    if (t.status === "success") {
      forgetCache();
      const rec = toRecorded(t);
      let after: TermBalance | null = null;
      try {
        if (student && rec) after = termBalance(student, rec.term, await onlinePayments(true), today());
      } catch { /* the receipt still stands without the new balance */ }
      return reply({
        paid: true,
        receipt: {
          receipt_number: t.reference,
          student: student ? `${student.name} (${student.id}), ${student.class}` : String(m.student_id),
          for: rec ? `${after?.term.name ?? rec.term} ${SESSION}` : SESSION,
          amount: naira(Math.round(t.amount / 100)),
          paid_at: t.paid_at,
          method: t.channel ?? "online",
        },
        balance_after: after ? { outstanding: naira(after.outstanding), status: after.status, due_by: after.outstanding > 0 ? after.dueBy : null } : null,
      });
    }
    if (t.status === "failed") {
      return reply({ paid: false, state: "failed", reason: t.gateway_response ?? "Declined",
        say: "The payment did not go through, and no money was taken. You can try again with a new link, or use another card or bank transfer." });
    }
    if (t.status === "reversed") {
      return reply({ paid: false, state: "reversed", say: "This payment was reversed. The accounts office will contact you.", escalate: true });
    }
    return reply({ paid: false, state: "not_completed", paystack_status: t.status,
      say: "The payment has not completed yet. If you have just paid, give it a minute and I will check again. If not, you can still use the same link." });
  });
}

export function registerBursarTools(server: McpServer) {
  server.registerTool("outstanding_report", {
    title: "Outstanding fees report",
    description: "For the school's accounts office only: every student with an unpaid or part-paid balance this term, with status, due date, days overdue and totals. Optionally filter by campus.",
    inputSchema: { campus: z.string().max(40).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ campus }, extra) => {
    capture("outstanding_report", extra);
    let online: Awaited<ReturnType<typeof onlinePayments>> = [];
    let onlineChecked = true;
    try { online = await onlinePayments(true); } catch (e) { onlineChecked = false; paystackTrouble(e); }
    const day = today();
    const term = currentTerm(day);
    const rows = STUDENTS
      .filter((s) => !campus || s.campus.toLowerCase() === campus.toLowerCase())
      .map((s) => ({ s, b: termBalance(s, term.id as TermId, online, day) }));
    const owing = rows.filter((r) => r.b.outstanding > 0).sort((a, b) => b.b.daysOverdue - a.b.daysOverdue || b.b.outstanding - a.b.outstanding);
    return reply({
      term: term.name, session: SESSION, today: day, term_closes: term.ends,
      totals: {
        students: rows.length,
        paid_in_full: rows.filter((r) => r.b.status === "paid").length,
        owing: owing.length,
        overdue: owing.filter((r) => r.b.status === "overdue").length,
        outstanding: naira(owing.reduce((n, r) => n + r.b.outstanding, 0)),
      },
      owing: owing.map(({ s, b }) => ({
        student_id: s.id, name: s.name, class: s.class, campus: s.campus, parent: s.parent.name,
        outstanding: naira(b.outstanding), status: b.status, due_by: b.dueBy, days_overdue: b.daysOverdue,
      })),
      ...(onlineChecked ? {} : { warning: "Online payments could not be read; this report counts bank drafts only." }),
    });
  });
}
