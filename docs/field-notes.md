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

## The agent quoted N700,000; Paystack charged N702,000

- **What happened:** In the first live run, the agent sent a link for Amara's N700,000 balance. Paystack's checkout asked for **N702,000**. The test Paystack account passes Paystack's fee to customers, so checkout adds it on top.
- **How I found the cause:** I read the transaction back from Paystack: `amount` was 70,200,000 kobo and `requested_amount` was 70,000,000. Our ledger counted `amount`, so a paid term would have read N2,000 overpaid, and the receipt would have said N702,000 against fees.
- **Fix:** Fees are now credited with `requested_amount`. The receipt shows "Paystack charge N2,000" and the total charged as separate lines. The link message tells the parent upfront what checkout will show (`PARENT_PAYS_PAYSTACK_FEE=1`). A test covers each part.
- **Change in Chord:** Not Chord's bug, but a real go-live trap. If Chord's Paystack connector or docs had a note on fee bearers, the next builder would ask "who pays the fee?" before the first parent does.

## The model offered a payment the rules do not allow

- **What happened:** After a declined card, the agent offered Mr Okafor "a part payment of at least N100,000". That is not allowed: Amara had one payment left that term, so it must clear the balance. The tool would have refused the link, but the offer was already wrong.
- **Cause:** The skill described the rules, and the model paraphrased them. It took the general minimum and missed the per-family limit.
- **Fix:** The server now decides. `get_fee_balance` and a failed `check_payment` return `can_pay`, the exact options this family has (here, only the N700,000 balance), and the skill says to offer nothing else. Rules live in code; the prompt only says to follow the tool.
- **Second miss, same cause:** With the fix live, I asked for "a new link" in the same chat. The agent called no tool and repeated its earlier wrong offer from the conversation history. Skill v3 tells it to use only the latest `can_pay`, and to call `get_fee_balance` again after any payment attempt. A fresh conversation then behaved. Lesson: stale chat history is as dangerous as a paraphrased rule.
- **Change in Chord:** A per-reply view showing which skill sentence led to an answer would have made this quicker to trace. "How I did this" shows the tool calls, but not the reasoning between them.

## Paystack's test "Success" declined a N702,000 payment

- **What happened:** The founder paid the agent's N702,000 test link with Paystack's **Success** test option, twice. It came back "declined due to insufficient funds in your bank account".
- **How I found the cause:** I created untagged test transactions from a local script (the ledger ignores them) and paid each with Success. N5,000, N100,000 and N300,000 (N302,000 charged) all went through; N500,000 (N502,000) was declined. Paystack test mode declines large amounts and reports it as insufficient funds. None of the guides I found mentions it.
- **Fix:** Amara's invented draft now covers N1,000,000, so her N300,000 balance completes in test mode, and the README says where the limit is. The same probes also measured Paystack's real fee formula: it grosses the fee up so the school nets the exact amount (N5,000 becomes N5,177.67). The estimate now matches that to the kobo.
- **For a builder:** A "Success" that fails reads as a bug in your own code. One line in Paystack's test docs about the limit would save that hour.

## Creating a teammate from a skill file

Three small things in one screen (Team > Create a teammate, uploading `skill/` as a ZIP):

- **The Role field was filled with half a sentence from the skill.** It read "AI assistant: if anyone asks", the start of a rule in my instructions ("You are an AI assistant: if anyone asks, say so plainly..."). A wrong default in a field most people will not reread becomes the teammate's public role. Suggest: leave Role empty, or take it from the frontmatter `description`.
- **The skill is titled "Untitled skill"** although `SKILL.md` declares `name: chrisland-fees-assistant` in its frontmatter, which the docs say is the one required field. It still shows "Untitled skill v1" after publishing. Suggest: use the frontmatter `name` as the title.
- **"Your session was refreshed, please retry."** The first Create teammate failed with this. Retrying worked, and the teammate list shows no duplicate, so the first request did nothing. Suggest: refresh the session and replay the request (the API already takes an `idempotency_key` for exactly this), instead of making the user resubmit.

## A tool cannot tell who it is acting for (to confirm once credits arrive)

- **What happened:** The docs do not say whether a tool call carries the WhatsApp sender or the conversation. For a fees bot that is the difference between "the phone you are writing from proves who you are" and asking every parent to type their phone number.
- **How I am finding out:** The tool server records every tool call's headers and MCP `_meta` (`CAPTURE_REQUESTS=1`, `GET /debug/requests`). The next step is to read what Chord actually sends from the simulator.
- **Workaround meanwhile:** Verify by student ID plus registered phone on every call, with a lock after 5 failures.
- **Change in Chord:** Document it, and offer an opt-in signed header such as `X-Chord-Sender` (channel, sender ID, conversation ID) on tool calls, so tools can authorise per customer.

## Proactive messages need a conversation ID nobody can look up

- **What happened:** Paystack confirms a payment by webhook; the natural design is a receipt in the parent's chat at that moment. Event subscriptions run the teammate, but "results go only to your webhook". Scheduled `MESSAGE` tasks can reach WhatsApp, but need a `conversation_id`, and the docs give no way to find it from a phone number.
- **Workaround:** The parent replies "paid" and the agent verifies with Paystack. Reminders stay as drafts for the office.
- **Change in Chord:** Let an event subscription target a thread or sender ("deliver result to conversation X"), or document how to resolve a WhatsApp sender to a `conversation_id`.

## The docs describe MCP tools only; the app also has REST tools

- **What happened:** From the API docs (Teammates > MCP connections), I took custom tools to mean MCP servers only, and built an MCP server. In the app, Admin > Channels & Tools > Tools also offers **Custom tools (API)**: declare a REST endpoint by hand or import an OpenAPI file. I could find neither in the docs index.
- **Why it matters:** For a single REST call, the API option is a shorter path. MCP still suits this build: two endpoints with separate tokens keep the bursar's report out of the parents' agent.
- **Also:** both need a public HTTPS URL (loopback is blocked), so a local build needs a deploy or a tunnel before the first test.
- **Change in Chord:** List Custom tools (API) and OpenAPI import in the docs next to MCP connections, with when to choose which.
