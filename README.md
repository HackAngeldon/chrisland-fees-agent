# Chrisland fees assistant (demo)

A WhatsApp agent on [Chord](https://www.chordhq.xyz) that tells a parent their child's school fees balance and takes payment through a Paystack link, from "how much do I owe?" to a receipt. Built for the TSG Labs build exercise.

> **Demo.** Modelled on Chrisland Schools' published fee rules (Lagos). Not affiliated with Chrisland Schools. Every student, parent, phone number and balance is invented, and Paystack runs in **test mode** (live keys are refused).

## How it works

```
Parent on WhatsApp ──► Chord teammate ──(MCP over HTTPS)──► this tool server ──► Paystack test API
 (simulator)          skill: SKILL.md                       /mcp/parents          initialize, verify, list
                                                           /mcp/bursar           (Paystack is the ledger)
Bursar ◄── Chord teammate "Accounts desk" ◄── daily schedule ──► outstanding_report
```

- **The skill** (`skill/`) makes the agent behave like the school's accounts office: verify the parent, explain the balance in a few lines, offer only the payment options the rules allow, send exactly the link the tool returns, and confirm payment only from Paystack.
- **The tools** (`src/`) are a small MCP server Chord calls:
  - `verify_parent`: the student ID and the parent's registered phone must match.
  - `get_fee_balance`: the term's fees, payments (bank drafts plus Paystack), outstanding, status and due date.
  - `create_payment_link`: Paystack test transaction, with the student and term in its metadata.
  - `check_payment`: Paystack verify; a receipt and the new balance on success.
  - `outstanding_report` (bursar endpoint only): who owes, most overdue first.

## Design choices

- **Paystack is the ledger for online payments.** Balances are the school's fee rules, minus bank drafts the office recorded, minus successful Paystack transactions tagged for this school. There is no second database to drift from Paystack.
- **Least privilege by endpoint, not by prompt.** The parents' teammate is connected only to `/mcp/parents`. The bursar's report sits on `/mcp/bursar`, with its own token, so no wording a parent sends can reach other families' balances.
- **The parent is verified by student ID plus registered phone**, on every call (the server is stateless). Chord's docs do not say whether a tool learns the WhatsApp sender. `CAPTURE_REQUESTS=1` records what Chord actually sends, to find out (see `docs/field-notes.md`). Five failed checks lock a student ID for 15 minutes.
- **Money paths fail safe.** Creating a payment never retries: a retry after a timeout can create a second charge. Reads retry once. Every Paystack failure becomes a plain sentence for the parent, never a raw error or a key, and a refused key is escalated to the office.
- **Not Chord's built-in Paystack connector.** A generic connector lets the model choose the amount to charge. Here the server works out every amount from the school's rules and the verified family, so the model can only pick from options the rules allow.
- **Test mode is enforced in code**: a secret key that is not `sk_test_` stops the server from starting.

## Run it

```bash
npm install
cp .env.example .env      # add a Paystack TEST secret key and two random tokens
npm test                  # 21 tests, Paystack faked, no network
npm run dev               # tool server on :8787
npm run smoke -- tools    # then: balance / link / check / report, see scripts/smoke.ts
```

Chord needs a **public HTTPS** URL (it blocks loopback). On Render: **New > Blueprint**, pick this repo, and set `PAYSTACK_SECRET_KEY` (a test key), `TEST_INBOX` and `PUBLIC_BASE_URL` when asked; Render generates both tokens (`render.yaml`). Any other Node 20+ host works with `npm run build && npm start`.

> Render's free plan sleeps after 15 idle minutes and takes up to a minute to wake, which can outlast a tool call's timeout. Open `/health` before a demo, or use a paid instance while reviewers are testing.

## Connect it to Chord

The order matters: in Chord, a teammate with no MCP assignment gets every enabled server, and the app has no way to set one (see `docs/field-notes.md`, note 2).

1. **Admin > Channels & Tools > Tools > Custom tools (MCP) > Add server**, twice, both `streamable_http` with `bearer` auth:
   - **Fees tools (parents)**: `https://<host>/mcp/parents` with `PARENTS_TOKEN`. Allowed tools: `verify_parent, get_fee_balance, create_payment_link, check_payment`.
   - **Fees tools (bursar)**: `https://<host>/mcp/bursar` with `BURSAR_TOKEN`. Allowed tools: `outstanding_report`. Create it with **Enabled off**.
2. **Team > Create a teammate** from `skill/` (as a ZIP) for the **Fees Assistant**, and from `skill-bursar/` for the **Accounts Desk**.
3. **Pin each teammate to its server** through the API, with a key scoped to Teammates Read and Update only:
   ```bash
   npx tsx --env-file=.env scripts/chord.ts teammates
   npx tsx --env-file=.env scripts/chord.ts pin <fees-assistant-id> <parents-server-id>
   npx tsx --env-file=.env scripts/chord.ts pin <accounts-desk-id> <bursar-server-id>
   ```
   Pin Chord's default teammate to the parents server as well, then switch the bursar server on.
4. Give the Accounts Desk a daily 08:00 `Africa/Lagos` schedule: "Write the morning fees report."
5. Connect the Fees Assistant to the WhatsApp simulator.

**Reset the demo balances** before a new round of testing: set `LEDGER_TAG` to a new value (for example `chrisland-demo-2`) and redeploy. Payments made under the old tag stop counting.

**Keep it awake** during review: `.github/workflows/keep-warm.yml` pings `/health` every 10 minutes, because Render's free plan sleeps when idle.

## Tested live

Through Chord's in-app chat, against the deployed server and Paystack test mode (20 October 2026):

- **Verify and balance.** Mr Okafor is verified, and Amara's balance is read correctly, including the "one payment left" rule.
- **Declined card.** The agent says no money was taken and offers only the options the rules allow.
- **Successful payment.** A ₦300,000 link (₦302,000 at checkout) is paid with Paystack's Success option. The receipt shows ₦300,000 for fees, Paystack's ₦2,000 on its own line, and a balance of ₦0.
- **Siblings.** Mrs Bello is verified, and Daniel's balance comes back with his sister Aisha offered.
- **Cost.** About 0.08 credits per reply.

## Test data

| Student | ID | Registered phone | This term (on 20 Oct 2026) |
|---|---|---|---|
| Tobi Adeyemi, Year 4 | CHR-1042 | 0800 000 0101 | Paid in full |
| Amara Okafor, Year 2 | CHR-1057 | 0800 000 0102 | ₦300,000 left, due 30 Oct (one payment left) |
| Daniel Bello, Year 6 | CHR-1103 | 0800 000 0103 | ₦1,300,000 overdue |
| Aisha Bello, Nursery 2 (Daniel's sister) | CHR-1150 | 0800 000 0103 | ₦500,000 left, due 30 Oct |
| Emeka Nwosu, Year 3, Lekki (new pupil) | CHR-2011 | 0800 000 0104 | ₦1,450,000 overdue |
| Kemi Johnson, JSS 2 | CHR-1120 | 0800 000 0105 | ₦800,000 left, due 30 Oct |
| Zainab Lawal, SS 1 (scholarship) | CHR-1088 | 0800 000 0106 | ₦500,000 overdue |

Pay on Paystack's test checkout by choosing **Success** (or **Declined** for the failed-payment path). Paystack's test mode declines larger amounts as "insufficient funds" (₦302,000 went through, ₦502,000 did not), so the demo balances that end in a full payment stay under that: pay Amara's ₦300,000, or a part payment of up to ₦300,000 for Daniel.

## What is deliberately left out

- **Check-in alerts** ("your child is in class"): they need the school's gate or attendance system, a separate integration.
- **Receipts pushed the moment Paystack confirms.** Chord's event subscriptions return results to our server, not to the parent's chat. So the parent replies "paid" and the agent verifies; the Paystack webhook only refreshes the balance cache.
- **Recording bank transfers or drafts in chat**, refunds, discounts, waivers and penalties: these go to the accounts office.
- **A real WhatsApp number, live keys and real student data**: see `docs/go-live-note.md`.

## How AI tools were used

Built with Claude Code (Anthropic) as a pair: researching Chord's docs and the school's public fee rules, writing the tool server, tests and skill drafts, and reviewing failure paths. I chose the problem, the rules and the trade-offs, and reviewed and tested every part. The agent itself runs on Chord.
