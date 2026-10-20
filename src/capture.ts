/**
 * What Chord actually sends with a tool call, kept for the field notes.
 *
 * Chord's docs do not say whether a tool learns who it is acting for (the
 * WhatsApp sender, the conversation). With CAPTURE_REQUESTS=1 every tool
 * call's headers (credentials removed) and MCP `_meta` are kept here, the
 * last 50, readable at GET /debug/requests with the bursar token. If the
 * sender's number turns up, verify_parent can use it instead of asking.
 */
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;
interface Captured { at: string; tool: string; headers: Record<string, string>; meta: unknown; sessionId?: string }

const MAX = 50;
const buffer: Captured[] = [];
const SECRET_HEADERS = new Set(["authorization", "x-api-key", "cookie", "proxy-authorization"]);

export function capture(tool: string, extra: Extra) {
  if (process.env.CAPTURE_REQUESTS !== "1") return;
  const raw = (extra.requestInfo?.headers ?? {}) as Record<string, string | string[] | undefined>;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    headers[k] = SECRET_HEADERS.has(k.toLowerCase()) ? "[removed]" : Array.isArray(v) ? v.join(", ") : v;
  }
  const entry: Captured = { at: new Date().toISOString(), tool, headers, meta: extra._meta ?? null, sessionId: extra.sessionId };
  buffer.push(entry);
  if (buffer.length > MAX) buffer.shift();
  console.log("[capture]", tool, "headers:", Object.keys(headers).join(","), "meta:", JSON.stringify(entry.meta));
}

export const captured = () => [...buffer];
