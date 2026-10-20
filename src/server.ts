/**
 * The tool server Chord calls: MCP over Streamable HTTP, stateless (a fresh
 * MCP server per request, no sessions), so it runs the same on one machine
 * or many.
 *
 *   POST /mcp/parents      parent tools        (Bearer PARENTS_TOKEN or X-API-Key)
 *   POST /mcp/bursar       accounts tools      (Bearer BURSAR_TOKEN or X-API-Key)
 *   GET  /health           liveness, and whether Paystack is set up in test mode
 *   GET  /paid             where Paystack sends the parent after checkout
 *   POST /paystack/webhook Paystack events, signature checked
 *   GET  /debug/requests   captured tool-call headers (bursar token, CAPTURE_REQUESTS=1)
 */
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerBursarTools, registerParentTools } from "./tools.js";
import { webhookSignatureValid } from "./paystack.js";
import { forgetCache } from "./ledger.js";
import { captured } from "./capture.js";

const MAX_BODY = 1_000_000;

function tokenFor(kind: "parents" | "bursar"): string {
  return (kind === "parents" ? process.env.PARENTS_TOKEN : process.env.BURSAR_TOKEN)?.trim() ?? "";
}

function presented(req: http.IncomingMessage): string {
  const auth = req.headers.authorization ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const key = req.headers["x-api-key"];
  return (Array.isArray(key) ? key[0] : key)?.trim() ?? "";
}

function authorised(req: http.IncomingMessage, kind: "parents" | "bursar"): boolean {
  const want = tokenFor(kind), got = presented(req);
  if (!want || !got) return false;
  const a = Buffer.from(want), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res: http.ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : String(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("too_large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function mcp(kind: "parents" | "bursar", req: http.IncomingMessage, res: http.ServerResponse) {
  if (!authorised(req, kind)) return send(res, 401, { error: "unauthorised" });
  // Stateless: no standalone SSE stream to resume and no session to delete.
  if (req.method !== "POST") return send(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  let body: unknown;
  try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }); }
  const server = new McpServer({ name: kind === "parents" ? "chrisland-fees-parents" : "chrisland-fees-bursar", version: "1.0.0" });
  if (kind === "parents") registerParentTools(server); else registerBursarTools(server);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    console.error("[mcp]", e);
    if (!res.headersSent) send(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  }
}

const PAID_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment received</title><style>body{font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f7f6;color:#1d2a26}
main{max-width:22rem;padding:2rem;background:#fff;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center}h1{font-size:1.25rem}</style></head>
<body><main><h1>Thank you</h1><p>Your payment is being confirmed. Go back to WhatsApp and reply <b>paid</b>, and the fees assistant will send your receipt.</p>
<p style="color:#5b6b66;font-size:.85rem">Demo for the TSG Labs exercise. Test mode: no real money moved.</p></main></body></html>`;

export async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/mcp/parents") return await mcp("parents", req, res);
    if (url.pathname === "/mcp/bursar") return await mcp("bursar", req, res);
    if (url.pathname === "/health") {
      const k = process.env.PAYSTACK_SECRET_KEY?.trim() ?? "";
      return send(res, 200, { ok: true, paystack: !k ? "missing" : k.startsWith("sk_test_") ? "test" : "refused_not_test" });
    }
    if (url.pathname === "/paid") return send(res, 200, PAID_PAGE, "text/html; charset=utf-8");
    if (url.pathname === "/paystack/webhook" && req.method === "POST") {
      const raw = await readBody(req);
      const sig = req.headers["x-paystack-signature"];
      if (!(await webhookSignatureValid(raw, Array.isArray(sig) ? sig[0] : sig))) return send(res, 401, { error: "bad_signature" });
      const event = JSON.parse(raw) as { event?: string; data?: { reference?: string; status?: string } };
      console.log("[paystack webhook]", event.event, event.data?.reference, event.data?.status);
      if (event.event === "charge.success") forgetCache(); // the next balance read includes it
      return send(res, 200, { received: true });
    }
    if (url.pathname === "/debug/requests") {
      if (!authorised(req, "bursar")) return send(res, 401, { error: "unauthorised" });
      return send(res, 200, { capturing: process.env.CAPTURE_REQUESTS === "1", requests: captured() });
    }
    return send(res, 404, { error: "not_found" });
  } catch (e) {
    console.error("[server]", e);
    if (!res.headersSent) send(res, e instanceof Error && e.message === "too_large" ? 413 : 500, { error: "server_error" });
  }
}

/** Refuse to start in a state that could leak data or charge a real card. */
export function startupProblems(env = process.env): string[] {
  const problems: string[] = [];
  for (const name of ["PARENTS_TOKEN", "BURSAR_TOKEN"] as const) {
    if ((env[name]?.trim().length ?? 0) < 24) problems.push(`${name} must be set to a random value of 24+ characters.`);
  }
  if (env.PARENTS_TOKEN && env.PARENTS_TOKEN === env.BURSAR_TOKEN) problems.push("PARENTS_TOKEN and BURSAR_TOKEN must differ.");
  const k = env.PAYSTACK_SECRET_KEY?.trim();
  if (k && !k.startsWith("sk_test_")) problems.push("PAYSTACK_SECRET_KEY must be a test key (sk_test_...).");
  return problems;
}
