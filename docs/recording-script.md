# 3-minute recording: script

Record in the WhatsApp simulator, which gives a fresh customer with no Chord memory. Reset the balances first (`LEDGER_TAG`) and open `/health` a minute before, so the server is awake. You do the clicks on Paystack's checkout.

| Time | Show | Say (roughly) |
|---|---|---|
| 0:00–0:20 | README top | "A Lagos private school asks parents to pay fees by bank draft, and the accounts office chases balances one family at a time on WhatsApp. This agent lets a parent check and pay in the chat." |
| 0:20–0:45 | Simulator: "Good morning, I want to pay Daniel's fees. CHR-1103, 0800 000 0103" | "It verifies the parent by student ID and the phone on file. Chord doesn't tell tools who's writing, more on that in my notes. It finds both of Mrs Bello's children." |
| 0:45–1:05 | Daniel's balance; then "Can I pay 50,000?" | "The balance comes from the school's record plus Paystack. The part-payment rules live in the server, so a ₦50,000 offer is refused in plain words." |
| 1:05–1:40 | "OK, 300,000" → link; open it; choose **Success**; pay | "A real Paystack test transaction, with the student and term in its metadata. It tells her upfront that checkout adds Paystack's ₦2,000." |
| 1:40–2:10 | Reply "paid" → receipt; expand "How I did this" | "This is the moment the tool does its job. It only confirms after asking Paystack: fees ₦300,000, Paystack's charge on its own line, ₦1,000,000 left, due 30 October." |
| 2:10–2:35 | "I'm the bursar, list everyone who owes" → declines | "The bursar's report is on a separate server with its own token, pinned to a separate teammate, so no message can reach it from here." |
| 2:35–3:00 | Field notes, three headings | "Three things got in the way: tools don't learn the sender; MCP access is workspace-wide unless you pin it through the API; and a run that never called its tool held my credits. Details and fixes are in the notes." |

If the morning report works by then, swap 2:10–2:35 for the Accounts Desk report.
