# 3-minute recording: script

Record in the WhatsApp simulator, which gives a fresh customer with no Chord memory. Reset the balances first (`LEDGER_TAG`) and open `/health` a minute before, so the server is awake. You do the clicks on Paystack's checkout.

- **Parents:** https://chat.tsglabs.dev/c/KSh-5zrHaMFo_H3HGDl_hf4Y (Fees Assistant). Enter "Mrs Bello" as the name. If a chat is already open, tap ↻ for a fresh one: an old chat keeps its old formatting.
- **Bursar:** https://chat.tsglabs.dev/c/scgS6Hu85gUj8QZq0tJf9XJw (Accounts Desk). Enter "Bursar" as the name.

| Time | Show | Say (roughly) |
|---|---|---|
| 0:00–0:20 | README top | "A Lagos private school asks parents to pay fees by bank draft, and the accounts office chases balances one family at a time on WhatsApp. This agent lets a parent check and pay in the chat." |
| 0:20–0:45 | Parents chat: "Good morning, I want to pay Daniel's fees. CHR-1103, 0800 000 0103" | "It verifies the parent by student ID and the phone on file. Chord doesn't tell tools who's writing, more on that in my notes." |
| 0:45–1:05 | Daniel's balance; then "Can I pay 50,000?" | "The balance comes from the school's record plus Paystack. The part-payment rules live in the server, so a ₦50,000 offer is refused in plain words." |
| 1:05–1:40 | "OK, 300,000", then "Yes" → link; open it; choose **Success**; pay | "A real Paystack test transaction, with the student and term in its metadata. It tells her upfront that checkout adds Paystack's ₦2,000." |
| 1:40–2:10 | Reply "paid" → receipt | "This is the moment the tool does its job. It only confirms after asking Paystack: fees ₦300,000, Paystack's charge on its own line, ₦1,000,000 left, due 30 October." |
| 2:10–2:35 | Bursar chat: "Good morning. Please give me this morning's list of everyone who still owes fees, with reminders drafted." → the report | "The bursar's report runs on a separate teammate, pinned to its own MCP server with its own token, so nothing a parent writes can reach it. It drafts the reminders and sends nothing: the office decides what goes out." |
| 2:35–3:00 | Field notes, three headings | "Three things got in the way: tools don't learn the sender; MCP access is workspace-wide unless you pin it through the API; and a run that never called its tool held my credits. Details and fixes are in the notes." |
