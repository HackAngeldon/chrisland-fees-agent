/** The Paystack client: test keys only, every failure named, reads retry once, creating a payment never retries. */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { PaystackError, initializePayment, listSuccessful, setFetch, verifyPayment, webhookSignatureValid } from "../src/paystack.ts";
import { fakePaystack, tx } from "./fake-paystack.ts";

const TEST_KEY = "sk_test_" + "x".repeat(40);
afterEach(() => { setFetch(null); process.env.PAYSTACK_SECRET_KEY = TEST_KEY; });
process.env.PAYSTACK_SECRET_KEY = TEST_KEY;

const kindOf = async (p: Promise<unknown>) => { try { await p; return "none"; } catch (e) { return e instanceof PaystackError ? e.kind : "other"; } };

test("a live key or no key is refused before any request leaves", async () => {
  const fake = fakePaystack();
  process.env.PAYSTACK_SECRET_KEY = "sk_live_" + "y".repeat(40);
  assert.equal(await kindOf(verifyPayment("REF")), "live_key");
  process.env.PAYSTACK_SECRET_KEY = "";
  assert.equal(await kindOf(verifyPayment("REF")), "not_configured");
  assert.equal(fake.calls.length, 0);
});

test("initialize sends the amount in kobo, our reference and the metadata, with the test key", async () => {
  const fake = fakePaystack();
  const r = await initializePayment({ email: "a@b.co", amountKobo: 30_000_000, reference: "CHR-1103-T1-X", metadata: { student_id: "CHR-1103" } });
  assert.equal(r.authorization_url, "https://checkout.paystack.com/fake-CHR-1103-T1-X");
  const c = fake.calls[0];
  assert.deepEqual([c.method, c.path, c.body?.amount, c.body?.currency, c.body?.reference], ["POST", "/transaction/initialize", 30_000_000, "NGN", "CHR-1103-T1-X"]);
  assert.equal(c.auth, `Bearer ${TEST_KEY}`);
});

test("a failing initialize is reported once and never retried (a retry could create a second charge)", async () => {
  const fake = fakePaystack({ initFails: { status: 502, message: "Bad gateway" } });
  assert.equal(await kindOf(initializePayment({ email: "a@b.co", amountKobo: 100, reference: "R1", metadata: {} })), "unavailable");
  assert.equal(fake.calls.length, 1);
});

test("Paystack's answers map to named failures: bad key, unknown reference, outage, timeout", async () => {
  setFetch(async () => new Response(JSON.stringify({ status: false, message: "Invalid key" }), { status: 401 }));
  assert.equal(await kindOf(verifyPayment("R")), "auth");
  fakePaystack({ verify: {} });
  assert.equal(await kindOf(verifyPayment("NOPE")), "not_found");
  let n = 0;
  setFetch(async () => { n++; return new Response("<html>down</html>", { status: 503 }); });
  assert.equal(await kindOf(verifyPayment("R")), "unavailable");
  assert.equal(n, 2, "a read retries once");
  setFetch(async () => { const e = new Error("timed out"); e.name = "TimeoutError"; throw e; });
  assert.equal(await kindOf(verifyPayment("R")), "timeout");
});

test("a read that fails once and then answers succeeds", async () => {
  let n = 0;
  setFetch(async () => {
    n++;
    if (n === 1) return new Response("down", { status: 500 });
    return new Response(JSON.stringify({ status: true, message: "ok", data: [tx({ reference: "A", studentId: "CHR-1057", amountNaira: 1 })] }), { status: 200 });
  });
  assert.equal((await listSuccessful("2026-08-01T00:00:00.000Z", 1)).length, 1);
  assert.equal(n, 2);
});

test("webhook signatures: HMAC-SHA512 of the raw body with the secret key", async () => {
  const body = JSON.stringify({ event: "charge.success", data: { reference: "R" } });
  const good = createHmac("sha512", TEST_KEY).update(body).digest("hex");
  assert.equal(await webhookSignatureValid(body, good), true);
  assert.equal(await webhookSignatureValid(body + " ", good), false);
  assert.equal(await webhookSignatureValid(body, undefined), false);
});
