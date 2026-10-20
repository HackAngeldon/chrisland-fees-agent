# Going live: a note for the school

**What it does.** Parents message the school's WhatsApp number. The assistant checks who they are (student ID plus the phone on file), tells them what is owed for the term and by when, and sends a secure Paystack link for the full balance, a part payment within your rules, or next term ahead. When they reply "paid", it checks with Paystack and sends a receipt. Each morning the accounts office gets a short list of who owes, overdue families first, with reminders drafted.

**What it does not do.** It never records bank transfers or drafts, gives discounts, extends deadlines, issues refunds or settles disputes; it hands those to your accounts office. It answers only about fees.

**Before it goes live, these must be true:**

1. **Your own Paystack business account**, verified, with your settlement bank and live keys on the tool server. In this demo, checkout says "Ordina" because it uses a borrowed test account.
2. **A decision on Paystack's fee.** Either the school absorbs it, or parents pay it on top (up to ₦2,000 on local cards). The assistant already tells parents the checkout total either way.
3. **Your WhatsApp number connected to Chord.** Reminders sent more than 24 hours after a parent last wrote need Meta-approved templates.
4. **Real records from your school system**: students, classes, parent phone numbers and drafts already received. Parents should know you use their number this way (Nigeria Data Protection Act 2023).
5. **Your rules confirmed**: the annual discount, part payments (how many, and the minimum), clear-by dates and any penalty. The demo assumed these.
6. **A named accounts officer** who answers handed-over chats within working hours.
7. **A paid hosting plan.** The demo's free server sleeps when idle.

**Start carefully.** Run the first week with the assistant set to "Suggest, I approve", so the office sees every reply before it goes. Switch to "Act independently" once the replies look right.

**When something goes wrong:**
- **A payment fails:** the parent is told no money was taken and is offered a new link.
- **Paystack is down:** the assistant says to try later or pay by draft at the office.
- **A double charge or dispute:** handed to the office, which refunds from the Paystack dashboard.
- **Payments not set up** (a bad or expired key): the assistant stops offering links and hands the chat to the office. Watch handed-over chats daily.

**Main risk:** a wrong phone number on file locks a parent out, so fix records before launch. Tell parents the assistant only sends links from Paystack's checkout.
