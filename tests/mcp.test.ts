/**
 * End to end through the real MCP protocol: the server on a local port, the
 * official MCP client calling it the way Chord does, Paystack faked.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handle, startupProblems } from "../src/server.ts";
import { forgetCache } from "../src/ledger.ts";
import { fakePaystack, tx } from "./fake-paystack.ts";

const PARENTS = "parents-token-" + "p".repeat(20);
const BURSAR = "bursar-token-" + "b".repeat(20);
Object.assign(process.env, {
  PARENTS_TOKEN: PARENTS, BURSAR_TOKEN: BURSAR, PAYSTACK_SECRET_KEY: "sk_test_" + "k".repeat(40),
  DEMO_TODAY: "2026-10-20", PUBLIC_BASE_URL: "https://fees.example.test", CAPTURE_REQUESTS: "1", TEST_INBOX: "fees-demo@example.com",
});

let server: http.Server;
let base = "";
before(async () => {
  server = http.createServer((req, res) => void handle(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => forgetCache());

async function connect(path: string, token: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}${path}`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}
async function call(client: Client, name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args }) as { content: { type: string; text: string }[] };
  return JSON.parse(r.content[0].text) as Record<string, any>;
}

test("startup refuses missing or shared tokens and live keys", () => {
  assert.deepEqual(startupProblems(process.env), []);
  assert.equal(startupProblems({ PARENTS_TOKEN: "short", BURSAR_TOKEN: BURSAR }).length, 1);
  assert.ok(startupProblems({ PARENTS_TOKEN: BURSAR, BURSAR_TOKEN: BURSAR }).some((p) => /must differ/.test(p)));
  assert.ok(startupProblems({ PARENTS_TOKEN: PARENTS, BURSAR_TOKEN: BURSAR, PAYSTACK_SECRET_KEY: "sk_live_x" }).some((p) => /test key/.test(p)));
});

test("each endpoint needs its own token, and parents never see the bursar's report", async () => {
  const r = await fetch(`${base}/mcp/parents`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${BURSAR}` }, body: "{}" });
  assert.equal(r.status, 401);
  const parents = await connect("/mcp/parents", PARENTS);
  assert.deepEqual((await parents.listTools()).tools.map((t) => t.name).sort(), ["check_payment", "create_payment_link", "get_fee_balance", "verify_parent"]);
  const bursar = await connect("/mcp/bursar", BURSAR);
  assert.deepEqual((await bursar.listTools()).tools.map((t) => t.name), ["outstanding_report"]);
  await parents.close(); await bursar.close();
});

test("a parent is verified by student ID and phone; a wrong pair says nothing about the student; five misses lock the ID", async () => {
  fakePaystack();
  const c = await connect("/mcp/parents", PARENTS);
  const ok = await call(c, "verify_parent", { student_id: "CHR-1103", phone: "0800 000 0103" });
  assert.equal(ok.verified, true);
  assert.equal(ok.parent_first_name, "Halima");
  assert.deepEqual(ok.children.map((k: any) => k.name).sort(), ["Aisha Bello", "Daniel Bello"]);
  const wrong = await call(c, "verify_parent", { student_id: "CHR-1088", phone: "08000000999" });
  assert.equal(wrong.verified, false);
  assert.doesNotMatch(JSON.stringify(wrong), /Zainab|Lawal/);
  for (let i = 0; i < 4; i++) await call(c, "verify_parent", { student_id: "CHR-1088", phone: "08000000999" });
  const lockedOut = await call(c, "verify_parent", { student_id: "CHR-1088", phone: "08000000106" });
  assert.equal(lockedOut.locked, true, "even the right number waits once the ID is locked");
  await c.close();
});

test("the balance includes payments Paystack confirmed, and says so when Paystack cannot be read", async () => {
  fakePaystack({ successes: [tx({ reference: "CHR-1057-T1-OK", studentId: "CHR-1057", amountNaira: 200_000 }), tx({ reference: "OTHER", studentId: "CHR-1057", amountNaira: 999, school: "someone-else" })] });
  const c = await connect("/mcp/parents", PARENTS);
  const b = await call(c, "get_fee_balance", { student_id: "CHR-1057", phone: "+2348000000102" });
  assert.equal(b.current_term.paid, "₦1,200,000");
  assert.equal(b.current_term.outstanding, "₦100,000");
  assert.equal(b.current_term.status, "part_paid");
  assert.equal(b.next_term.total, "₦900,000");
  forgetCache();
  fakePaystack({ listFails: 503 });
  const degraded = await call(c, "get_fee_balance", { student_id: "CHR-1057", phone: "+2348000000102" });
  assert.equal(degraded.current_term.outstanding, "₦300,000", "bank drafts still count");
  assert.match(degraded.warning, /could not be checked/);
  await c.close();
});

test("a part payment link: the right amount in kobo, metadata for the bursar, the parent's email, a return page", async () => {
  const fake = fakePaystack();
  const c = await connect("/mcp/parents", PARENTS);
  const r = await call(c, "create_payment_link", { student_id: "CHR-1103", phone: "08000000103", pay: "part", amount_naira: 400000 });
  assert.equal(r.ok, true);
  assert.match(r.link, /^https:\/\/checkout\.paystack\.com\/fake-CHR-1103-T1-/);
  assert.equal(r.amount, "₦400,000");
  const init = fake.calls.find((x) => x.path === "/transaction/initialize")!;
  assert.equal(init.body?.amount, 40_000_000);
  assert.equal(init.body?.email, "fees-demo+chr-bello@example.com");
  assert.equal(init.body?.callback_url, "https://fees.example.test/paid");
  const meta = init.body?.metadata as Record<string, any>;
  assert.deepEqual([meta.school, meta.student_id, meta.term], ["chrisland-demo", "CHR-1103", "2026-27-T1"]);
  // Refusals come back in words, and no link is created.
  const before = fake.calls.length;
  const refused = await call(c, "create_payment_link", { student_id: "CHR-1042", phone: "08000000101", pay: "balance" });
  assert.equal(refused.ok, false);
  assert.match(refused.say, /already paid in full/);
  assert.equal(fake.calls.filter((x) => x.path === "/transaction/initialize").length, fake.calls.slice(0, before).filter((x) => x.path === "/transaction/initialize").length);
  await c.close();
});

test("when Paystack refuses the key, the parent hears it is unavailable and the office is flagged; no key or raw error leaks", async () => {
  fakePaystack({ initFails: { status: 401, message: "Invalid key sk_test_abc" } });
  const c = await connect("/mcp/parents", PARENTS);
  const r = await call(c, "create_payment_link", { student_id: "CHR-1103", phone: "08000000103", pay: "balance" });
  assert.deepEqual([r.ok, r.error, r.escalate], [false, "payments_not_set_up", true]);
  assert.doesNotMatch(JSON.stringify(r), /sk_test|Invalid key/);
  await c.close();
});

test("check_payment: a receipt and the new balance on success; failed, unfinished, unknown and other merchants' payments each answered", async () => {
  const paid = tx({ reference: "CHR-1057-T1-PAID", studentId: "CHR-1057", amountNaira: 300_000 });
  fakePaystack({
    successes: [paid],
    verify: {
      "CHR-1057-T1-PAID": paid,
      "CHR-1103-T1-FAIL": tx({ reference: "CHR-1103-T1-FAIL", studentId: "CHR-1103", amountNaira: 1_300_000, status: "failed", gateway: "Insufficient Funds" }),
      "CHR-1103-T1-OPEN": tx({ reference: "CHR-1103-T1-OPEN", studentId: "CHR-1103", amountNaira: 1_300_000, status: "abandoned" }),
      "NOT-OURS": tx({ reference: "NOT-OURS", studentId: "CHR-1103", amountNaira: 5, school: "another-shop" }),
    },
  });
  const c = await connect("/mcp/parents", PARENTS);
  const ok = await call(c, "check_payment", { reference: "CHR-1057-T1-PAID" });
  assert.equal(ok.paid, true);
  assert.equal(ok.receipt.amount, "₦300,000");
  assert.match(ok.receipt.student, /Amara Okafor \(CHR-1057\)/);
  assert.deepEqual([ok.balance_after.outstanding, ok.balance_after.status], ["₦0", "paid"]);
  const failed = await call(c, "check_payment", { reference: "CHR-1103-T1-FAIL" });
  assert.deepEqual([failed.paid, failed.state, failed.reason], [false, "failed", "Insufficient Funds"]);
  assert.match(failed.say, /no money was taken/);
  const open = await call(c, "check_payment", { reference: "CHR-1103-T1-OPEN" });
  assert.deepEqual([open.paid, open.state], [false, "not_completed"]);
  const unknown = await call(c, "check_payment", { reference: "NO-SUCH-REF" });
  assert.equal(unknown.state, "not_found");
  const other = await call(c, "check_payment", { reference: "NOT-OURS" });
  assert.equal(other.state, "not_found", "a payment for another merchant on the same account is not a school fee");
  await c.close();
});

test("the bursar's report lists who owes, most overdue first, with totals", async () => {
  fakePaystack({ successes: [] });
  const c = await connect("/mcp/bursar", BURSAR);
  const r = await call(c, "outstanding_report", {});
  assert.equal(r.totals.students, 7);
  assert.equal(r.totals.paid_in_full, 1);
  assert.equal(r.totals.owing, 6);
  assert.equal(r.totals.outstanding, "₦4,850,000");
  assert.equal(r.owing[0].days_overdue, 43);
  const lekki = await call(c, "outstanding_report", { campus: "lekki" });
  assert.deepEqual(lekki.owing.map((o: any) => o.student_id), ["CHR-2011"]);
  await c.close();
});

test("captured requests keep headers for the field notes, with the token removed", async () => {
  const r = await fetch(`${base}/debug/requests`, { headers: { Authorization: `Bearer ${BURSAR}` } });
  const j = await r.json() as { requests: { headers: Record<string, string> }[] };
  assert.ok(j.requests.length > 0);
  for (const q of j.requests) assert.equal(q.headers.authorization, "[removed]");
  assert.equal((await fetch(`${base}/debug/requests`, { headers: { Authorization: `Bearer ${PARENTS}` } })).status, 401);
});

test("a parent who pays Paystack's fee on top: fees are credited with the asked amount, the charge shows on its own line", async () => {
  const paid = tx({ reference: "CHR-1057-T1-FEE", studentId: "CHR-1057", amountNaira: 300_000, feeNaira: 2_000 });
  fakePaystack({ successes: [paid], verify: { "CHR-1057-T1-FEE": paid } });
  const c = await connect("/mcp/parents", PARENTS);
  const r = await call(c, "check_payment", { reference: "CHR-1057-T1-FEE" });
  assert.deepEqual([r.receipt.amount, r.receipt.paystack_charge, r.receipt.total_charged], ["₦300,000", "₦2,000", "₦302,000"]);
  assert.deepEqual([r.balance_after.outstanding, r.balance_after.status], ["₦0", "paid"], "not overpaid by the fee");
  await c.close();
});

test("the link says what checkout will show when the parent pays Paystack's fee", async () => {
  fakePaystack();
  process.env.PARENT_PAYS_PAYSTACK_FEE = "1";
  try {
    const c = await connect("/mcp/parents", PARENTS);
    const r = await call(c, "create_payment_link", { student_id: "CHR-1120", phone: "08000000105", pay: "balance" });
    assert.deepEqual([r.amount, r.paystack_charge, r.checkout_total], ["₦800,000", "₦2,000", "₦802,000"]);
    assert.match(r.say_about_charge, /The school receives ₦800,000/);
    await c.close();
  } finally { delete process.env.PARENT_PAYS_PAYSTACK_FEE; }
});

test("can_pay lists only what the rules allow: last payment clears, part payments, paying ahead", async () => {
  fakePaystack();
  const c = await connect("/mcp/parents", PARENTS);
  const amara = await call(c, "get_fee_balance", { student_id: "CHR-1057", phone: "08000000102" });
  assert.deepEqual(amara.can_pay, [{ option: "balance", amount: "₦300,000" }], "one payment left: it must clear the term");
  const daniel = await call(c, "get_fee_balance", { student_id: "CHR-1103", phone: "08000000103" });
  assert.deepEqual(daniel.can_pay.map((o: any) => o.option), ["balance", "part"]);
  assert.equal(daniel.can_pay[1].min, "₦100,000");
  const tobi = await call(c, "get_fee_balance", { student_id: "CHR-1042", phone: "08000000101" });
  assert.deepEqual(tobi.can_pay, [{ option: "next_term", amount: "₦900,000", term: "Second term" }]);
  await c.close();
});

test("after a failed payment, the retry options follow the rules too", async () => {
  fakePaystack({ verify: { "CHR-1057-T1-NO": tx({ reference: "CHR-1057-T1-NO", studentId: "CHR-1057", amountNaira: 300_000, status: "failed", gateway: "Insufficient Funds" }) } });
  const c = await connect("/mcp/parents", PARENTS);
  const r = await call(c, "check_payment", { reference: "CHR-1057-T1-NO" });
  assert.deepEqual(r.can_pay, [{ option: "balance", amount: "₦300,000" }]);
  await c.close();
});
