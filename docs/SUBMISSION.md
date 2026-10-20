# TSG Labs build exercise: Michael (hackangeldon@gmail.com)

## 1. Role and problem statement

**Role:** Technical Product Management (also open to Forward-deployed Engineering).

Chrisland Schools is a private school group in Lagos, from crèche to Sixth Form. Its published rules ask parents to pay fees by certified bank draft on or before the first day of each term. In practice, the accounts office chases balances one family at a time, and Lagos proprietors say arrears pile up by mid-term until payroll is at risk (BusinessDay, September 2025).

My agent lets a parent ask "how much do I owe?" on WhatsApp. It verifies them, quotes the exact balance and due date, and takes the payment through Paystack, confirmed and receipted in the same chat. Each morning, the bursar gets a list of who owes, with reminders drafted.

It is worth paying for because every naira collected on time is cash the school does not have to chase, and every receipt it sends is a reconciliation the office no longer does by hand. I deliberately left out check-in alerts, recording bank transfers in chat, refunds and discounts: they need the school's own systems or a person's judgement.

*Demo, not affiliated with Chrisland Schools. Every student, parent and balance is invented, and Paystack runs in test mode.*

## 2. The working agent

The agent is live in the Chord workspace **Chrisland Schools (demo)**, as the teammate **Fees Assistant**. The **Accounts Desk** teammate handles the bursar's report. Test data, with student IDs and registered phones, is in the README.

## 3. Code

https://github.com/HackAngeldon/chrisland-fees-agent

The repo holds the skill files, the MCP tool server (TypeScript, Paystack test mode), 28 tests, the deploy config, and a README on running and connecting it.

## 4. Recording

*(link to add)*

## 5. Deployment field notes

`docs/field-notes.md`, with the three that mattered most:
1. Chord does not tell a tool who it is acting for.
2. MCP access is workspace-wide by default, and narrowing it is API-only.
3. A teammate that never called its tool held credits I could not see.

## 6. Go-live note

`docs/go-live-note.md`, half a page for the school's owner.
