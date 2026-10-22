# Deployment field notes

The three problems that cost the most time, or would cost the next builder. Each says what happened, how I found the cause, what I did, and what I would change in Chord.

## 1. Chord does not tell a tool who it is acting for

- **What happened:** A fees bot has to know whose child it is talking about. On WhatsApp, the natural proof is the phone a parent writes from: if it matches the number on the school's record, they are verified. Chord's docs do not say whether a tool call carries the sender, the conversation or the channel.
- **How I found out:** I made the tool server record every tool call's header names and MCP `_meta` (`src/capture.ts`, `CAPTURE_REQUESTS=1`). Every call from Chord carried only transport headers: `authorization`, `user-agent`, `content-type`, and the Render and Cloudflare proxy headers. `_meta` was `null`: no sender, no conversation ID, no channel. The data does exist in Chord, because the API key screen offers a privileged "Trusted context" scope that lets an external-chat bridge submit a verified sender. It just never reaches the tool. I re-checked on 22 Oct from TSG's WhatsApp simulator: all six calls, to `verify_parent`, `get_fee_balance`, `create_payment_link` and `outstanding_report`, carried the same transport headers and `_meta: null`, so the WhatsApp channel does not pass the sender either.
- **What I did:** Verify on every call with the student ID plus the parent's registered phone, stateless, and lock a student ID for 15 minutes after 5 failed checks. It works, but a parent writing from the very number on file still has to type it.
- **The same gap blocks proactive messages.** A receipt should land in the parent's chat the moment Paystack's webhook confirms. Event subscriptions run a teammate, but return the result only to my webhook. Scheduled `MESSAGE` tasks can reach WhatsApp, but need a `conversation_id` that nothing lets me look up. So the parent replies "paid" and the agent checks with Paystack.
- **Change in Chord:** Add an opt-in, signed context header on tool calls, for example `X-Chord-Context` with the channel, sender ID and conversation ID, HMAC-signed with the server's token. Tools could then authorise per customer, and a webhook-triggered run could reply in the right chat.

## 2. MCP access is workspace-wide by default, and narrowing it is API-only

- **What happened:** I split the tools across two MCP servers on purpose. Parents get balances and payment links. The bursar gets the list of every family that owes. The bursar's list must never be reachable from the parents' agent, however a parent words a message. In the app, though, a teammate's Tools panel lists only first-party connectors. MCP servers never appear there, and the docs' rule is "empty means all": every teammate silently gets every enabled MCP server. Enabling the bursar server would have handed the parents' agent the bursar's report, and Chord's default "Chord Assistant" teammate would have got it too.
- **How I found the cause:** The MCP connections page documents the rule in a gotcha. Then I looked for where to change it: assignment exists only as `PUT /v1/teammates/{id}` with `set_mcp_server_ids`. The API key screen has no MCP scopes, so a scoped key gets HTTP 403 on listing servers. The teammate record leaves out `mcp_server_ids` while it is empty, so "all servers" and "never set" look the same.
- **What I did:**
  1. Created the bursar server switched off.
  2. Took the server IDs from the app's own network requests.
  3. Pinned each teammate with a key scoped to Teammates Read and Update only (`scripts/chord.ts`), and read each one back.
  4. Switched the bursar server on.
  
  Each endpoint also has its own token, so even a mis-assignment could not reach the other server's tools.
- **Change in Chord:** Add an MCP section to each teammate's settings, and MCP scopes to the API key screen. Make "all servers" an explicit choice rather than what an empty list silently means.

## 3. A teammate that never called its tool held credits I could not see

- **What happened:** The bursar's teammate answered "Write the morning fees report" with "Pulling the outstanding fees data now", then nothing, three times. My server's logs show no `outstanding_report` call. Meanwhile the parents' teammate on the other server worked end to end.
- **What I checked:** The bursar server's health check said ok in 752 ms, discovery listed `outstanding_report`, and the teammate read-back held the right server ID.
- **The second effect:** "Credits used" read 0.89, all from the parents' teammate. But the available balance fell from 9.23 to 2.99, with the rest "held for active runs", and the app said "You're out of credits". No active run appears in Activity or Needs you, and there is nothing to cancel.
- **What I did:** Stopped testing so nothing more was held, and reported it to TSG Labs the same hour, as the brief asks.
- **Outcome:** TSG Labs added 50 credits on 21 Oct. On 22 Oct the same teammate, with the same skill and server, called `outstanding_report` on the first try from the simulator and wrote the whole report, reminders included. The held credits did not come back: the balance read about 53, the 2.99 left plus the 50 added. The three silent runs from 20 Oct still sit in its direct line with no reply. That points at the runs, not my server or the pinning, though I cannot see inside Chord to prove it.
- **Change in Chord:**
  - Show active runs with what each holds, and let an admin cancel one.
  - Release the hold when a run ends without a tool call.
  - When an assigned tool is not offered to the model, say why in "How I did this".

## Also hit (one line each)

- **Paystack passed its fee to the parent** (₦700,000 quoted, ₦702,000 charged): fees are now credited from `requested_amount`, with Paystack's charge on its own receipt line.
- **The model once offered a payment the rules forbid:** the rules moved into code (`get_fee_balance` returns `can_pay`), and the skill offers nothing else.
- **Chord passed Markdown to WhatsApp unchanged,** so bold showed as `**₦1,300,000**`: fixed in both skills; Chord could convert Markdown at the channel instead.
