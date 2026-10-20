/**
 * A fake Paystack for tests: records every request and answers from a small
 * in-memory world, so no test ever reaches the network or needs a real key.
 */
import { setFetch, type Transaction } from "../src/paystack.ts";

export interface FakeCall { method: string; path: string; body: Record<string, unknown> | null; auth: string | null }

export function fakePaystack(opts: {
  successes?: Transaction[];
  verify?: Record<string, Transaction | { status: number; message: string }>;
  initFails?: { status: number; message: string };
  listFails?: number; // answer the list call with this HTTP status
} = {}) {
  const calls: FakeCall[] = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  setFetch(async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    const auth = new Headers(init?.headers).get("authorization");
    calls.push({ method: init?.method ?? "GET", path: url.pathname + url.search, body, auth });
    if (url.pathname === "/transaction/initialize") {
      if (opts.initFails) return json(opts.initFails.status, { status: false, message: opts.initFails.message });
      return json(200, { status: true, message: "Authorization URL created", data: { authorization_url: `https://checkout.paystack.com/fake-${String(body?.reference)}`, access_code: "ac_fake", reference: body?.reference } });
    }
    if (url.pathname.startsWith("/transaction/verify/")) {
      const ref = decodeURIComponent(url.pathname.split("/").pop()!);
      const v = opts.verify?.[ref];
      if (!v) return json(404, { status: false, message: "Transaction reference not found" });
      if ("message" in v && typeof v.status === "number" && !("reference" in v)) return json(v.status, { status: false, message: v.message });
      return json(200, { status: true, message: "Verification successful", data: v });
    }
    if (url.pathname === "/transaction") {
      if (opts.listFails) return json(opts.listFails, { status: false, message: "Service unavailable" });
      return json(200, { status: true, message: "Transactions retrieved", data: opts.successes ?? [] });
    }
    return json(404, { status: false, message: "Unknown fake route" });
  });
  return { calls, restore: () => setFetch(null) };
}

/** A successful school fees transaction as Paystack returns it. */
export function tx(p: { reference: string; studentId: string; amountNaira: number; status?: string; term?: string; school?: string; gateway?: string }): Transaction {
  return {
    id: Math.floor(Math.random() * 1e9), reference: p.reference, status: p.status ?? "success",
    amount: p.amountNaira * 100, currency: "NGN", paid_at: p.status && p.status !== "success" ? null : "2026-10-20T10:15:00.000Z",
    channel: "card", gateway_response: p.gateway ?? (p.status === "failed" ? "Declined" : "Successful"),
    metadata: { school: p.school ?? "chrisland-demo", student_id: p.studentId, term: p.term ?? "2026-27-T1", purpose: "school_fees" },
  };
}
