/**
 * Talk to a running tool server through MCP, the way Chord does, against the
 * real Paystack test API. Nothing here is faked.
 *
 *   npm run dev                                  (in another terminal)
 *   npm run smoke -- tools                       list both endpoints' tools
 *   npm run smoke -- balance CHR-1057 08000000102
 *   npm run smoke -- link CHR-1103 08000000103 part 400000
 *   npm run smoke -- check <reference>           after paying with a Paystack test card
 *   npm run smoke -- report                      the bursar's report
 *
 * SMOKE_URL points it at a deployed server instead of localhost.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = (process.env.SMOKE_URL ?? `http://localhost:${process.env.PORT ?? 8787}`).replace(/\/$/, "");

async function client(kind: "parents" | "bursar") {
  const token = kind === "parents" ? process.env.PARENTS_TOKEN : process.env.BURSAR_TOKEN;
  const c = new Client({ name: "smoke", version: "1.0.0" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${kind}`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return c;
}

async function call(kind: "parents" | "bursar", name: string, args: Record<string, unknown>) {
  const c = await client(kind);
  const r = await c.callTool({ name, arguments: args }) as { content: { text: string }[]; isError?: boolean };
  await c.close();
  const out = JSON.parse(r.content[0].text);
  console.log(JSON.stringify(out, null, 2));
  return out;
}

const [cmd, ...a] = process.argv.slice(2);
switch (cmd) {
  case "tools": {
    for (const kind of ["parents", "bursar"] as const) {
      const c = await client(kind);
      console.log(kind, (await c.listTools()).tools.map((t) => t.name).join(", "));
      await c.close();
    }
    break;
  }
  case "balance": await call("parents", "get_fee_balance", { student_id: a[0], phone: a[1] }); break;
  case "link": await call("parents", "create_payment_link", { student_id: a[0], phone: a[1], pay: a[2] ?? "balance", ...(a[3] ? { amount_naira: Number(a[3]) } : {}) }); break;
  case "check": await call("parents", "check_payment", { reference: a[0] }); break;
  case "report": await call("bursar", "outstanding_report", a[0] ? { campus: a[0] } : {}); break;
  default:
    console.log("Usage: npm run smoke -- tools | balance <id> <phone> | link <id> <phone> [balance|part|next_term] [amount] | check <ref> | report [campus]");
    process.exitCode = 1;
}
