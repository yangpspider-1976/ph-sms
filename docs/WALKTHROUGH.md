# Walkthrough

A guided tour of the working application in mock mode. Roughly fifteen minutes.

**Nothing here sends a real SMS or takes a real payment.** Every page carries a
demo marker, and the seeded logins do not exist outside mock mode.

## Before you start

Three terminals:

```bash
npm run db:dev     # 1. database
npm run worker     # 2. dispatch — without this, nothing is ever sent
npm run dev        # 3. the app, at http://localhost:3000
```

If this is a fresh database: `npm run db:migrate && npm run seed`.

## 1. The public site — 2 minutes

Open <http://localhost:3000>.

- **Pricing** says "Contact us for current pricing". That is deliberate: no
  approved rate exists, and publishing the demo price would be inventing one.
- **Bulk SMS** is the inquiry route for high-volume and promotional sending. Note
  that it takes no attachment and says plainly that it does not want your
  recipient list.

## 2. Sign in as a business — 1 minute

Go to **Log in**. In mock mode the page lists the seeded accounts; use
`owner@demo.test` / `DemoPass123!`.

The dashboard shows available credit, today's destination quota, and two numbers
kept deliberately apart: **accepted by provider** and **delivered**. They are not
the same thing and the interface never conflates them.

## 3. Send a message — 5 minutes

**Send SMS** in the sidebar.

### Recipients

Paste these, one per line — they are synthetic numbers reserved for fixtures:

```
+639170000601
+639170009001
+639170000601
0917
```

The preview updates as you type: four rows entered, two unique and valid, one
duplicate, one invalid. Note the line under it — *format is checked, not
ownership*. A well-formed number is not evidence that anyone is on the other end.

### Message

Type anything. Watch the counter: it reports characters, segments and encoding
separately. Now paste an emoji. The encoding flips to Unicode and the limit drops
from 160 to 70, because that is what actually happens on the wire.

Try typing `{{first_name}}`. It is rejected, with the reason: personalization is
not built, so the variable would be sent to your customer literally.

Tick the authorization checkbox and press **Review message**.

### Review

This screen is the offer. It is priced by the server, stored, and has an expiry.

Note what it shows: recipients, encoding, segments each, segments billed, price
per segment, **maximum authorized cost**, and what was excluded before pricing.
Also note the line saying the sender cannot receive replies — which is why the
product never tells recipients to reply STOP.

Press **Send**.

### Results

You land on the campaign page. Within a second or two the worker picks it up;
reload.

- `+639170000601` → **Accepted by provider**, charged.
- `+639170009001` → **Rejected**, not charged, its hold released.

The mock provider scripts its behaviour from the last four digits, so these
outcomes are reproducible rather than random.

Read the line next to the status: *"Finished means no dispatch work remains —
not that every message was delivered."* Delivery is a separate column, and it
only ever changes when a verified provider receipt says so.

## 4. The money — 2 minutes

**Credits & billing**.

The ledger is append-only and shows every movement:

| Movement | What happened |
|---|---|
| Credit added | The demo funding |
| Held for a send | Reserved when the campaign was accepted |
| Charged for messages | The accepted message |
| Hold released | The rejected message's reservation, returned |

`available = posted balance − holds`. Nothing was charged for the message the
provider refused, and nothing was charged before the provider accepted.

## 5. Opt-outs — 2 minutes

**Contacts → Opt-out list**. Add `+639170000601` — the number you just messaged.

Now go back to **Send SMS** and try to send to it again. It is excluded before
pricing, and the quote refuses if nothing eligible remains.

This is checked three times: when the quote is priced, again when the send is
confirmed, and once more immediately before each individual message leaves.

Try deleting the contact and re-importing it from a CSV. The opt-out survives —
it lives in a different table for exactly this reason.

## 6. The admin console — 3 minutes

Sign out and back in as `admin@phsms.test`.

A different console, deliberately a different colour, so an operator always knows
which one they are in.

- **Verification** — the review queue. Approving requires no reason; rejecting or
  suspending does, because a decision with no stated cause cannot be reviewed
  later.
- **Sender IDs** — note the checkbox about inbound replies. Ticking it is what
  would let the product tell recipients to reply STOP, so it is only ticked when
  a route genuinely exists.
- **Bulk inquiries** — the pipeline. Move one to *Contracted* and read the
  confirmation: *"No SMS was sent."* An inquiry is a CRM record; contracting one
  never queues a message.
- **Suppression** — platform-wide safety blocks, clearly separated from a
  customer's own opt-out list, which no admin screen can edit.
- **Audit logs** — every approval, send, stop, wallet movement and export. No
  full phone numbers, no message bodies.
- **Settings** — the live-readiness gaps, listed rather than discovered later.

## 7. The awkward paths — optional

These are the ones worth understanding, because they are where SMS platforms
usually mislead their users. Send to each and watch the campaign page.

| Number | What happens |
|---|---|
| `+639170009002` | The provider accepts, then the connection dies. Recorded **UNKNOWN**, hold kept, never re-sent, resolved by querying the provider — and charged exactly once. |
| `+639170009003` | Transient failure *before* acceptance. Safe to retry, and it is. |
| `+639170009004` | Accepted, later reported undelivered. |
| `+639170009005` | Accepted, no receipt ever arrives. Stays "awaiting receipt" rather than being guessed. |

The `9002` case is the important one. A timeout is not a failure and not a
success, and treating it as either would mean either charging for nothing or
sending someone the same message twice.

## What you will not find

Because it is not built, rather than hidden:

- Team invitations
- Personalization and contact groups
- Recurring campaigns and automatic top-ups
- A customer API
- Promotional self-service — it is inquiry-only by design

Screens for deferred features say so plainly instead of showing a button that
does nothing.
