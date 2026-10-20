# Deployment field notes (draft: final pick of 2 to 3 after the Chord build)

Each note follows: what happened, how I found the cause, the fix or workaround, and what I would change in Chord.

## Onboarding cut my business description without saying so

- **What happened:** In onboarding, "About your business" took my description and showed it ending mid-sentence ("Not affiliated with Chrisland"): the last sentence, the disclaimer I most needed kept, was gone.
- **How I found it:** The text looked short, so I read the field's value: `maxLength` is 500, and the browser drops the rest of what is typed or pasted. There was no counter, no message, and nothing on the label.
- **Fix:** Rewrote it at 435 characters, with the disclaimer first.
- **Change in Chord:** Show a live counter ("435 / 500") and the limit on the label, and warn on paste instead of silently cutting.

## The sign-in code went to spam

- **What happened:** Chord's sign-in code email ("Your Chord code") landed in Gmail's spam folder, so a new user waits at the code screen.
- **How I found it:** It was not in the inbox; I found it in Spam.
- **Change in Chord:** Check SPF, DKIM and DMARC alignment for the sending domain, and say "check your spam folder" on the code screen.

## A tool cannot tell who it is acting for (to confirm once credits arrive)

- **What happened:** The docs do not say whether a tool call carries the WhatsApp sender or the conversation. For a fees bot that is the difference between "the phone you are writing from proves who you are" and asking every parent to type their phone number.
- **How I am finding out:** The tool server records every tool call's headers and MCP `_meta` (`CAPTURE_REQUESTS=1`, `GET /debug/requests`). The next step is to read what Chord actually sends from the simulator.
- **Workaround meanwhile:** Verify by student ID plus registered phone on every call, with a lock after 5 failures.
- **Change in Chord:** Document it, and offer an opt-in signed header such as `X-Chord-Sender` (channel, sender ID, conversation ID) on tool calls, so tools can authorise per customer.

## Proactive messages need a conversation ID nobody can look up

- **What happened:** Paystack confirms a payment by webhook; the natural design is a receipt in the parent's chat at that moment. Event subscriptions run the teammate, but "results go only to your webhook". Scheduled `MESSAGE` tasks can reach WhatsApp, but need a `conversation_id`, and the docs give no way to find it from a phone number.
- **Workaround:** The parent replies "paid" and the agent verifies with Paystack. Reminders stay as drafts for the office.
- **Change in Chord:** Let an event subscription target a thread or sender ("deliver result to conversation X"), or document how to resolve a WhatsApp sender to a `conversation_id`.

## Custom tools require a public MCP server

- **Observation:** There is no plain HTTP tool. Every custom tool is a remote MCP server on a public HTTPS URL; loopback is blocked, so a local build needs a deploy or a tunnel before the first test.
- **Change in Chord:** A "test against localhost" path in development, or a hosted HTTP-tool option for simple REST calls.
