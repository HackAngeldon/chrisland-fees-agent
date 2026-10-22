# Chrisland fees assistant (demo)

A WhatsApp agent on [Chord](https://www.chordhq.xyz) that tells a parent their child's school fees balance and takes payment through a Paystack link, from "how much do I owe?" to a receipt. Built for the TSG Labs build exercise.

> **Demo.** Modelled on Chrisland Schools' published fee rules (Lagos). Not affiliated with Chrisland Schools. Every student, parent, phone number and balance is invented, and Paystack runs in **test mode** (live keys are refused).

## How it works

```
Parent on WhatsApp ──► Chord teammate ──(MCP over HTTPS)──► this tool server ──► Paystack test API
 (simulator)          skill: SKILL.md                       /mcp/parents          initialize, verify, list
                                                           /mcp/bursar           (Paystack is the ledger)
Bursar ◄── Chord teammate "Accounts Desk" ◄── daily schedule ──► outstanding_report
```

- **The skills** (`skill/`, `skill-bursar/`) make each teammate behave like the school's accounts office: verify the parent, explain the balance in a few lines, offer only the options the rules allow, send exactly the link the tool returns, and confirm a payment only from Paystack.
- **The tools** (`src/`) are a small MCP server Chord calls: `verify_parent`, `get_fee_balance`, `create_payment_link` (a Paystack test transaction with the student and term in its metadata), `check_payment` (Paystack verify, then the receipt and new balance), and `outstanding_report` on the bursar endpoint only.
- **Design choices:**
  - Paystack is the ledger for online payments, so there is no second database to drift.
  - The bursar's report sits on its own endpoint with its own token, so nothing a parent writes can reach other families' balances.
  - The server works out every amount from the school's rules; the model can only pick from the options it returns.
  - Creating a payment never retries (a retry after a timeout could charge twice), and every Paystack failure becomes a plain sentence for the parent.

## Run it

```bash
npm install
cp .env.example .env      # a Paystack TEST secret key and two random tokens
npm test                  # Paystack faked, no network
npm run dev               # tool server on :8787
```

Chord needs a **public HTTPS** URL. On Render: **New > Blueprint**, pick this repo, and set `PAYSTACK_SECRET_KEY` (a test key), `TEST_INBOX` and `PUBLIC_BASE_URL`; Render generates both tokens (`render.yaml`). Render's free plan sleeps when idle, so a pinger hits `/health` every few minutes while reviewers test.

## Connect it to Chord

The order matters: a teammate with no MCP assignment gets every enabled server, and only the API can set one (field note 2).

1. **Admin > Channels & Tools > Custom tools (MCP)**: add `https://<host>/mcp/parents` with `PARENTS_TOKEN`, and `https://<host>/mcp/bursar` with `BURSAR_TOKEN`, the second one switched off.
2. **Team > Create a teammate** from `skill/` (Fees Assistant) and from `skill-bursar/` (Accounts Desk).
3. Pin each teammate to its server with a key scoped to Teammates Read and Update: `npx tsx --env-file=.env scripts/chord.ts pin <teammate-id> <server-id>`. Pin Chord's default teammate to the parents server too, then switch the bursar server on.
4. Connect the WhatsApp simulator: **Admin > Connected apps**, allow **WhatsApp Simulator**, then create a chat link per teammate at chat.tsglabs.dev.

To reset the demo balances, set `LEDGER_TAG` to a new value and redeploy.

## Test data

| Student | ID | Registered phone | This term |
|---|---|---|---|
| Tobi Adeyemi, Year 4 | CHR-1042 | 0800 000 0101 | Paid in full |
| Amara Okafor, Year 2 | CHR-1057 | 0800 000 0102 | ₦300,000 left, due 30 Oct (one payment left) |
| Daniel Bello, Year 6 | CHR-1103 | 0800 000 0103 | ₦1,300,000 overdue |
| Aisha Bello, Nursery 2 (Daniel's sister) | CHR-1150 | 0800 000 0103 | ₦500,000 left, due 30 Oct |
| Emeka Nwosu, Year 3, Lekki | CHR-2011 | 0800 000 0104 | ₦1,450,000 overdue |
| Kemi Johnson, JSS 2 | CHR-1120 | 0800 000 0105 | ₦800,000 left, due 30 Oct |
| Zainab Lawal, SS 1 | CHR-1088 | 0800 000 0106 | ₦500,000 overdue |

On Paystack's test checkout choose **Success**, or **Declined** for the failed-payment path. Test mode declines large amounts, so keep a single payment at ₦300,000 or less. Live test transcripts are in `docs/test-conversations.md`.

## How AI tools were used

Built with Claude Code (Anthropic) as a pair: researching Chord's docs and the school's public fee rules, writing the tool server, tests and skill drafts, and reviewing failure paths. I chose the problem, the rules and the trade-offs, and reviewed and tested every part. The agent itself runs on Chord.
