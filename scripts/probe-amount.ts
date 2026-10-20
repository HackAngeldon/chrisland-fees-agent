/**
 * Does Paystack test mode decline by amount? Create one plain test
 * transaction of the given naira amount, with NO school metadata (so the
 * ledger never counts it), and print its checkout link.
 *
 *   npx tsx --env-file=.env scripts/probe-amount.ts 5000
 */
const naira = Number(process.argv[2] ?? "5000");
const key = process.env.PAYSTACK_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_") || !Number.isFinite(naira) || naira <= 0) { console.error("Usage: probe-amount.ts <naira> (test key in .env)"); process.exit(1); }
const reference = `PROBE-${naira}-${Date.now().toString(36)}`.toUpperCase();
const r = await fetch("https://api.paystack.co/transaction/initialize", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "probe@example.com", amount: naira * 100, currency: "NGN", reference, metadata: { purpose: "amount_probe" } }),
});
const j = await r.json() as { status: boolean; message: string; data?: { authorization_url: string } };
console.log(JSON.stringify({ ok: j.status, message: j.message, reference, link: j.data?.authorization_url }, null, 2));
