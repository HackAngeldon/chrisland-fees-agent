/**
 * Pin each Chord teammate to its own MCP server, through Chord's API (the app
 * has no per-teammate MCP assignment). Reads CHORD_API_KEY from .env and
 * never prints it.
 *
 *   npx tsx --env-file=.env scripts/chord.ts teammates
 *   npx tsx --env-file=.env scripts/chord.ts teammate <teammateId>
 *   npx tsx --env-file=.env scripts/chord.ts servers <workspaceId>
 *   npx tsx --env-file=.env scripts/chord.ts pin <teammateId> <mcp-serverId> [more ids]
 */
const BASE = process.env.CHORD_BASE_URL ?? "https://api.chordhq.xyz";
const key = process.env.CHORD_API_KEY?.trim();
if (!key) { console.error("CHORD_API_KEY is not set in .env"); process.exit(1); }

async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, json, text: json ? "" : text.slice(0, 300) };
}

/** Keep only the fields worth reading; drop anything that looks like a secret. */
function slim(o: unknown, keys: string[]): unknown {
  if (Array.isArray(o)) return o.map((x) => slim(x, keys));
  if (!o || typeof o !== "object") return o;
  return Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([k]) => keys.includes(k) && !/token|secret|key/i.test(k)));
}

const TEAMMATE_FIELDS = ["id", "identifier", "name", "workspace_id", "workspaceId", "status", "mcp_server_ids", "mcpServerIds", "autonomy"];
const [cmd, ...a] = process.argv.slice(2);

if (cmd === "teammates") {
  const r = await api("GET", "/v1/teammates");
  const list = (r.json as { data?: unknown[]; teammates?: unknown[] } | unknown[] | null);
  const items = Array.isArray(list) ? list : (list as { data?: unknown[]; teammates?: unknown[] } | null)?.data ?? (list as { teammates?: unknown[] } | null)?.teammates ?? list;
  console.log(r.status, JSON.stringify(slim(items, TEAMMATE_FIELDS), null, 2), r.text);
} else if (cmd === "teammate") {
  const r = await api("GET", `/v1/teammates/${a[0]}`);
  const t = (r.json as { data?: unknown } | null)?.data ?? r.json;
  console.log(r.status, JSON.stringify(slim(t, TEAMMATE_FIELDS), null, 2), r.text);
  if (t && typeof t === "object") console.log("all field names:", Object.keys(t as object).join(", "));
} else if (cmd === "servers") {
  const r = await api("GET", `/v1/workspaces/${a[0]}/mcp-servers`);
  console.log(r.status, JSON.stringify(slim((r.json as { data?: unknown } | null)?.data ?? r.json, ["id", "name", "url", "enabled", "transport", "auth_type", "enabled_tools"]), null, 2), r.text);
} else if (cmd === "pin") {
  const [teammate, ...ids] = a;
  if (!teammate || !ids.length || ids.some((i) => !i.startsWith("mcp-"))) { console.error("Usage: pin <teammateId> <mcp-...> [mcp-...]"); process.exit(1); }
  const r = await api("PUT", `/v1/teammates/${teammate}`, { set_mcp_server_ids: ids });
  console.log("PUT", r.status, r.text || JSON.stringify(slim((r.json as { data?: unknown } | null)?.data ?? r.json, TEAMMATE_FIELDS)));
  const back = await api("GET", `/v1/teammates/${teammate}`);
  console.log("read back", back.status, JSON.stringify(slim((back.json as { data?: unknown } | null)?.data ?? back.json, TEAMMATE_FIELDS)));
} else {
  console.error("Usage: teammates | teammate <id> | servers <workspaceId> | pin <teammateId> <mcp-id...>");
  process.exit(1);
}
