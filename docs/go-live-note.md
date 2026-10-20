# Going live: a note for the school (draft)

**What it does.** Parents message the school's WhatsApp number. The assistant checks who they are, tells them what is owed for the term and by when, and sends a secure Paystack link for the full balance, a part payment (within your rules), or next term ahead. When they reply "paid", it confirms the payment with Paystack and sends a receipt. Each morning the accounts office gets a short list of who owes, overdue families first, with reminder messages ready to send.

**What it does not do.** It does not record bank transfers or drafts, give discounts, extend deadlines, issue refunds or settle disputes: it hands these to your accounts office. It answers only about fees.

**Before it goes live, these must be true:**

1. **Your own Paystack business account**, verified, with your settlement bank account and live keys. The keys stay on the tool server and are never pasted into chat.
2. **Your WhatsApp number connected to Chord**, through a WhatsApp Business account. Reminders sent more than 24 hours after a parent last wrote need Meta-approved message templates.
3. **Real records loaded from your school system**: students, classes, the parent phone numbers on file, and bank drafts already received. Parents should know the school uses their number this way, in line with the Nigeria Data Protection Act 2023.
4. **Your rules confirmed**: the annual discount, whether part payments are allowed and how many, the clear-by dates, and any penalty. The demo assumed some of these; yours replace them.
5. **Someone on duty for handovers**: a named accounts officer who sees handed-over chats within working hours, and a phone number the assistant can give parents.

**When something goes wrong:**

- **A payment fails:** the parent is told no money was taken and is offered a new link.
- **Paystack is down:** the assistant says to try again later and mentions bank drafts at the accounts office.
- **Someone is charged twice:** this is visible in Paystack. The office refunds from the Paystack dashboard, and the assistant hands the chat over.
- **Who gets alerted:** the accounts office receives each handover and any "payments not set up" error the same day.

**Main risks:** a wrong phone number on file locks a parent out, so fix records before launch. Parents may also trust a forwarded fake link; the assistant only ever sends links from Paystack's checkout domain, so tell parents that.
