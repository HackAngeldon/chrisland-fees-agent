/** The fee rules and balance arithmetic, on the invented roster, on fixed dates. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findStudent, normalisePhone, parentEmail, paystackFeeEstimate, planPayment, termBalance, termTotal, verifyParent, type RecordedPayment } from "../src/school.ts";

const MID_TERM = "2026-10-20"; // first term, before the 30 Oct clear-by date
const s = (id: string) => findStudent(id)!;
const bal = (id: string, day = MID_TERM, online: RecordedPayment[] = [], term: "2026-27-T1" | "2026-27-T2" = "2026-27-T1") => termBalance(s(id), term, online, day);

test("a primary pupil's session matches the public figure: N1.3M first term, N900k after, N3.1M a year", () => {
  assert.equal(termTotal(s("CHR-1042"), "2026-27-T1"), 1_300_000);
  assert.equal(termTotal(s("CHR-1042"), "2026-27-T2"), 900_000);
  assert.equal(termTotal(s("CHR-1042"), "2026-27-T1") + termTotal(s("CHR-1042"), "2026-27-T2") + termTotal(s("CHR-1042"), "2026-27-T3"), 3_100_000);
});

test("every family on the roster, mid first term", () => {
  const cases: [string, number, number, string][] = [
    // id, total, outstanding, status
    ["CHR-1042", 1_300_000, 0, "paid"],
    ["CHR-1057", 1_300_000, 300_000, "part_paid"],
    ["CHR-1103", 1_300_000, 1_300_000, "overdue"],
    ["CHR-1150", 1_000_000, 500_000, "part_paid"],
    ["CHR-2011", 1_450_000, 1_450_000, "overdue"], // new pupil: registration and caution on top
    ["CHR-1120", 1_600_000, 800_000, "part_paid"],
    ["CHR-1088", 500_000, 500_000, "overdue"], // scholarship covers tuition, not the levy and books
  ];
  for (const [id, total, outstanding, status] of cases) {
    const b = bal(id);
    assert.deepEqual([b.total, b.outstanding, b.status], [total, outstanding, status], id);
  }
  assert.equal(bal("CHR-1103").daysOverdue, 43, "overdue since the first day of term");
  assert.equal(bal("CHR-1057").dueBy, "2026-10-30", "a part-paid term is due by the clear-by date");
});

test("a part-paid term turns overdue after the clear-by date; next term is not due before it starts", () => {
  const late = bal("CHR-1057", "2026-11-02");
  assert.deepEqual([late.status, late.daysOverdue], ["overdue", 3]);
  assert.equal(bal("CHR-1042", "2027-01-05", [], "2026-27-T2").status, "not_due");
});

test("online payments count for the right student and term only", () => {
  const online: RecordedPayment[] = [
    { term: "2026-27-T1", amount: 200_000, method: "paystack", ref: "CHR-1057-T1-A", date: "2026-10-19", studentId: "CHR-1057" },
    { term: "2026-27-T1", amount: 999_999, method: "paystack", ref: "CHR-1103-T1-B", date: "2026-10-19", studentId: "CHR-1103" },
    { term: "2026-27-T2", amount: 900_000, method: "paystack", ref: "CHR-1057-T2-C", date: "2026-10-19", studentId: "CHR-1057" },
  ];
  const b = bal("CHR-1057", MID_TERM, online);
  assert.deepEqual([b.paid, b.outstanding, b.payments.length, b.paymentsLeft], [1_200_000, 100_000, 2, 0]);
});

test("payment rules: full balance, part payments, the last payment, the minimum, overpaying, paying ahead", () => {
  const daniel = bal("CHR-1103");
  assert.deepEqual(planPayment(daniel, "balance"), { ok: true, amount: 1_300_000, termId: "2026-27-T1", covers: "First term 2026/2027, full balance" });
  const part = planPayment(daniel, "part", 400_000);
  assert.ok(part.ok && part.amount === 400_000 && /₦900,000 left, due by 2026-10-30/.test(part.covers));
  const tooSmall = planPayment(daniel, "part", 50_000);
  assert.ok(!tooSmall.ok && /at least ₦100,000/.test(tooSmall.reason));
  const tooBig = planPayment(daniel, "part", 2_000_000);
  assert.ok(!tooBig.ok && /more than the balance/.test(tooBig.reason));
  const exact = planPayment(daniel, "part", 1_300_000);
  assert.ok(exact.ok && /full balance/.test(exact.covers));

  // Amara has one payment left this term: it must clear the balance.
  const amara = bal("CHR-1057");
  const last = planPayment(amara, "part", 200_000);
  assert.ok(!last.ok && /would be the last/.test(last.reason));
  assert.ok(planPayment(amara, "balance").ok);

  // Paid in full: nothing to pay now, but next term can be paid ahead.
  const tobi = bal("CHR-1042");
  const none = planPayment(tobi, "balance");
  assert.ok(!none.ok && /already paid in full/.test(none.reason));
  const ahead = planPayment(tobi, "next_term", undefined, bal("CHR-1042", MID_TERM, [], "2026-27-T2"));
  assert.deepEqual(ahead, { ok: true, amount: 900_000, termId: "2026-27-T2", covers: "Second term 2026/2027, paid ahead" });
  const notYet = planPayment(daniel, "next_term", undefined, bal("CHR-1103", MID_TERM, [], "2026-27-T2"));
  assert.ok(!notYet.ok && /clear this term's balance first/.test(notYet.reason));
});

test("parent check: the student ID and registered phone must match, in any phone format; siblings come back together", () => {
  for (const phone of ["+2348000000103", "08000000103", "234 800 000 0103", "0800-000-0103"]) {
    const v = verifyParent("chr-1103", phone);
    assert.ok(v.ok, phone);
    if (v.ok) assert.deepEqual(v.children.map((c) => c.id).sort(), ["CHR-1103", "CHR-1150"]);
  }
  assert.equal(verifyParent("CHR-1103", "+2348000000101").ok, false, "another parent's number");
  assert.equal(verifyParent("CHR-9999", "+2348000000103").ok, false, "unknown student");
  assert.equal(normalisePhone("12345"), null);
});

test("parent emails are invented: a plus address on the test inbox, or example.com", () => {
  assert.equal(parentEmail(s("CHR-1103"), "me@mail.test"), "me+chr-bello@mail.test");
  assert.equal(parentEmail(s("CHR-1103"), undefined), "parent.bello@example.com");
  assert.equal(parentEmail(s("CHR-1103"), "not an email"), "parent.bello@example.com");
});

test("an empty or malformed DEMO_TODAY falls back to the real Lagos date (found live: .env ships it empty)", async () => {
  const { today } = await import("../src/tools.ts");
  const saved = process.env.DEMO_TODAY;
  try {
    process.env.DEMO_TODAY = "";
    assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
    process.env.DEMO_TODAY = "soon";
    assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
    process.env.DEMO_TODAY = "2026-10-20";
    assert.equal(today(), "2026-10-20");
  } finally { process.env.DEMO_TODAY = saved; }
});

test("Paystack's fee, grossed up as measured on the test account, capped at N2,000", () => {
  assert.equal(paystackFeeEstimate(5_000), 177.67);
  assert.equal(paystackFeeEstimate(100_000), 1_624.37);
  assert.equal(paystackFeeEstimate(300_000), 2_000);
  assert.equal(paystackFeeEstimate(700_000), 2_000);
});
