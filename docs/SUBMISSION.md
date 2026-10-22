# TSG Labs build exercise: Michael (hackangeldon@gmail.com)

## 1. Role and problem statement

**Role:** Technical Product Management (also open to Forward-deployed Engineering).

Chrisland Schools, a private school group in Lagos, asks parents to pay fees by bank draft, and its accounts office chases every balance one family at a time on WhatsApp until arrears pile up by mid-term (BusinessDay, September 2025). My agent lets a parent ask "how much do I owe?" on WhatsApp, verifies them, quotes the exact balance and takes the payment through Paystack, confirmed and receipted in the same chat, while the bursar gets a morning list of who owes with reminders drafted. It is worth paying for because every naira collected on time is cash the school does not have to chase, and every receipt is a reconciliation the office no longer does by hand. I deliberately left out check-in alerts, recording bank transfers, refunds and discounts, which need the school's own systems or a person's judgement.

*Demo, not affiliated with Chrisland Schools. Every student, parent and balance is invented, and Paystack runs in test mode.*

## 2. The working agent

Live in the Chord workspace **Chrisland Schools (demo)**: the **Fees Assistant** talks to parents, and the **Accounts Desk** writes the bursar's morning report. The WhatsApp simulator links are in my submission email, kept out of this public repo so the exercise credits are spent only on review. Test students and phones are in the README.

## 3. Code

https://github.com/HackAngeldon/chrisland-fees-agent: the skill files, the MCP tool server (TypeScript, Paystack test mode), tests, deploy config, and a README on running and connecting it.

## 4. Recording

A 3-minute walkthrough of one full conversation, linked in my submission email.

## 5. Deployment field notes

`docs/field-notes.md`, three problems:
1. Chord does not tell a tool who it is acting for.
2. MCP access is workspace-wide by default, and narrowing it is API-only.
3. A teammate that never called its tool held credits I could not see.

## 6. Go-live note

`docs/go-live-note.md`, half a page for the school's owner.

## 7. What stopped me, and what I would build next

- **Stopped:** tools never learn the WhatsApp sender, so parents type their student ID and registered phone instead of being recognised by the number they write from (note 1). Held credits stopped testing for a day until TSG Labs topped them up (note 3).
- **Next, with more time:**
  - recognise parents by the number they write from, once Chord passes a signed sender;
  - send the receipt the moment Paystack's webhook confirms, which needs Chord to give a tool the conversation to reply in;
  - read real records from the school's system and send Meta-approved reminders from the school's own number;
  - let a parent send a photo of a bank-draft teller for the office to confirm, instead of handing it over.
