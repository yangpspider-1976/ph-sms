# State model

Three separate lifecycles. Collapsing them into one status field is the usual
way an SMS product ends up telling customers things that are not true, so they
are three columns.

## 1. Campaign execution

Is there dispatch work left to do?

```
  DRAFT ──▶ SCHEDULED ──┐
    │                   ├──▶ QUEUED ──▶ PROCESSING ──▶ FINISHED
    └───────────────────┘                   │
                                            ├──▶ PAUSED_REVIEW
                                            └──▶ CANCELLED
```

| State | Meaning |
|---|---|
| `DRAFT` | Being composed. Nothing reserved. |
| `SCHEDULED` | Accepted and waiting for its time. Funds and quota are already held. |
| `QUEUED` | Accepted for immediate dispatch. |
| `PROCESSING` | A worker is submitting messages. |
| `PAUSED_REVIEW` | Something changed that needs a human. **No automatic resume.** |
| `FINISHED` | No dispatch work remains. |
| `CANCELLED` | Stopped. Only affects messages not yet past the provider. |

**`FINISHED` does not mean delivered.** It means nothing is left to dispatch.
The UI says so in as many words on the campaign page.

A campaign with `UNKNOWN` submissions does **not** finish — those are genuinely
unresolved, and closing the campaign would imply a certainty we do not have.

### What causes PAUSED_REVIEW

Checked before each campaign, and re-checked per message:

- the organization is no longer `ACTIVE` (suspended, rejected);
- the sender identity is no longer `APPROVED` (revoked, rejected).

There is deliberately no automatic resume. Whatever changed — a suspension, a
revoked sender, a policy decision — was a human decision, and restarting the
send is one too.

## 2. Message submission

Did the provider take responsibility for this message?

```
  PENDING ──▶ SUBMITTING ──┬──▶ ACCEPTED
     │                     ├──▶ REJECTED ──▶ (transient: back to PENDING)
     │                     └──▶ UNKNOWN  ──▶ (query only) ──▶ ACCEPTED
     ├──▶ EXCLUDED     (opted out before sending)
     └──▶ CANCELLED    (stopped before submission)
```

| State | Meaning | Money |
|---|---|---|
| `PENDING` | Not yet attempted. | Held |
| `SUBMITTING` | In flight. A worker holds it. | Held |
| `ACCEPTED` | The provider took it. | **Charged** |
| `REJECTED` | The provider refused it. Nothing was sent. | Released |
| `UNKNOWN` | We do not know. It may well have been sent. | **Stays held** |
| `EXCLUDED` | Opted out between submission and dispatch. | Released |
| `CANCELLED` | Stopped before it was submitted. | Released |

`PENDING → SUBMITTING` is a compare-and-set, so two workers cannot both take the
same message.

### UNKNOWN in detail

A timeout or a dropped connection after the request left us is **not a failure**.
The provider may have accepted and sent the message.

- The hold stays. There is no automatic refund of an ambiguous timeout.
- It is **never blindly re-sent**. A local database cannot promise exactly-once
  delivery through someone else's system.
- It is resolved by *querying* the provider — only if the provider supports a
  query, and only as a query.
- A replay of the same stable key is permitted **only** where the provider's
  contract guarantees idempotency for that key within a retention window.
  `ProviderCapabilities.guaranteesIdempotency` records that;
  `PartnerSmsProvider` sets it `false` because nobody has told us otherwise.
- Otherwise it waits for an operator, and the campaign stays open.

Charging on resolution uses the operation reference `capture:<stableKey>`, which
is unique in the ledger. Reconciliation can run any number of times and charge
at most once.

## 3. Delivery

Only meaningful for `ACCEPTED` messages, and only ever written from a verified
provider event.

| State | Meaning |
|---|---|
| `PENDING` | Accepted, no receipt yet. |
| `DELIVERED` | The provider confirmed delivery. |
| `UNDELIVERED` | The provider confirmed it did not arrive. |
| `EXPIRED` | The provider gave up. |
| `UNAVAILABLE` | **No conclusive receipt is possible** — not a failure, not a success. |

`UNAVAILABLE` is what you get when the provider has no delivery-receipt
mechanism at all. It is not a polite word for "failed".

### Ordering rules

`DELIVERED`, `UNDELIVERED` and `EXPIRED` are terminal.

- A late `PENDING` or `ACCEPTED` event **cannot** reopen a terminal state.
  Delivered never regresses.
- Two *different* terminal results for one message are a provider problem. The
  first stands; the second is quarantined for an operator rather than
  overwriting silently.
- An event for an unknown reference is quarantined, not dropped — a receipt can
  legitimately arrive before the submission response was stored, and
  `retryQuarantined()` picks those up once the reference exists.

Nothing in this codebase marks a message delivered on its own initiative.

## Reconciling a report

These always add up:

```
requested = included + excluded-at-quote + excluded-at-submit
included  = accepted + rejected + unknown + excluded + cancelled + pending
charged   = accepted (at the campaign's snapshotted price)
```

The campaign page shows accepted, delivered, undelivered and unresolved as
separate counts. There is no single "success" number, because there is no single
honest one.

## Organization status

```
  PENDING_REVIEW ──┬──▶ ACTIVE ──▶ SUSPENDED
                   ├──▶ NEEDS_INFORMATION
                   └──▶ REJECTED
```

Only `ACTIVE` organizations, with a verified user and an approved sender, can
test or send. Every transition records the actor, the time and a reason;
anything other than an approval **requires** a reason.

## Payment status

```
  PENDING ──┬──▶ PAID ──┬──▶ REFUNDED
            ├──▶ FAILED └──▶ DISPUTED   (chargeback)
            └──▶ EXPIRED
```

Only `PENDING → PAID` credits a wallet, and only from a verified event or
server-side reconciliation that matches the amount, currency, merchant,
environment and package snapshot recorded at checkout. A second `PAID` event for
an already-settled payment credits nothing.
