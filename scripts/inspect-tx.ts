/**
 * Print the money fields Paystack returns for one transaction (test mode),
 * to see how fees passed to the customer show up. No secrets printed.
 *
 *   npx tsx --env-file=.env scripts/inspect-tx.ts <reference>
 */
const ref = process.argv[2];
const key = process.env.PAYSTACK_SECRET_KEY ?? "";
if (!ref || !key.startsWith("sk_test_")) { console.error("Usage: inspect-tx.ts <reference> (with a test key in .env)"); process.exit(1); }
const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, { headers: { Authorization: `Bearer ${key}` } });
const j = await r.json() as { data?: Record<string, unknown> };
const d = j.data ?? {};
const pick = ["status", "amount", "requested_amount", "fees", "fees_split", "currency", "gateway_response", "channel", "paid_at"];
console.log(JSON.stringify(Object.fromEntries(pick.map((k) => [k, d[k] ?? null])), null, 2));
