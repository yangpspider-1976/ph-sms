# Adapter contract

What the SMS partner and the payment provider have to supply before either can
be connected, and what the code already expects.

Nothing in this repository guesses at a partner payload.
[`PartnerSmsProvider`](../src/server/providers/sms.ts) throws
`PartnerNotConfiguredError` and
[`UnconfiguredPaymentProvider`](../src/server/providers/payments.ts) refuses,
rather than inventing an endpoint that would look finished and quietly do
nothing — or worse, send something malformed to a live gateway.

## SMS provider

Implement `SmsProvider` in `src/server/providers/sms.ts`. Nothing outside that
file needs to change.

### `capabilities: ProviderCapabilities`

| Field | Why the platform needs it |
|---|---|
| `supportsUnicode` | Whether non-GSM characters can be sent at all |
| `supportsNonBmp` | Strict UCS-2 cannot carry emoji outside the BMP; the composer must reject them up front rather than at send time |
| `supportsQuery` | Whether an `UNKNOWN` submission can be resolved by lookup |
| `supportsDeliveryWebhook` | If false, delivery is reported as `UNAVAILABLE` rather than guessed |
| **`guaranteesIdempotency`** | **The most consequential flag.** Whether re-sending the same stable key is contractually guaranteed not to produce a second SMS |
| `idempotencyWindowMs` | How long that guarantee lasts |
| `maxSegments` | Rejected above this |
| `gsm7Single` / `gsm7Concatenated` / `ucs2Single` / `ucs2Concatenated` | Segment lengths. These **override** the mock's 160/153/70/67 |

If `guaranteesIdempotency` is false, an `UNKNOWN` submission is never retried —
it waits for reconciliation or an operator. Setting it true without a contract
that says so risks sending a customer's message twice.

### `submitMessage({ stableKey, normalizedNumber, sender, content })`

Returns exactly one of:

```ts
{ outcome: "ACCEPTED";  reference, latencyMs }
{ outcome: "REJECTED";  category, code, message, latencyMs }
{ outcome: "UNKNOWN";   code, message, latencyMs }
```

`UNKNOWN` is for a timeout, a dropped connection, or any case where the request
may have reached the provider. **Do not map a timeout to `REJECTED`.** That
would release the hold and let the message be re-sent, after the provider may
already have delivered it.

`stableKey` is ours, deterministic, and carries no phone number. Pass it as the
provider's idempotency key if it accepts one.

### Error categories

Map every documented provider code to one of:

| Category | Behaviour |
|---|---|
| `TRANSIENT` | Bounded retry, but only if nothing was submitted |
| `PERMANENT` | No retry |
| `RECIPIENT` | Bad number. No retry, hold released |
| `BALANCE` | Our account with the partner. Alert an operator |
| `SENDER` | Sender not permitted. Stops retries, alerts |
| `POLICY` | Content refused. Stops retries, alerts |
| `AUTH` | Credentials. Stops retries, alerts immediately |

An unmapped code is safest treated as `PERMANENT`.

### `querySubmission(referenceOrStableKey)` — optional

Only implement if the provider can genuinely look up a prior submission. This is
what resolves `UNKNOWN` without re-sending. Omit it rather than fake it.

### `verifyAndMapDeliveryEvent(rawBody, headers)`

Return `null` for anything that fails verification. Never throw on bad input —
a malformed callback is an ordinary event, not an exception.

The **raw body** is passed unparsed, because signatures are computed over the
exact bytes. Do not re-serialize before verifying.

### What we need in writing from the partner

- Base URLs for sandbox and production, and credentials for both
- Request and response schemas, with real sample payloads
- The full list of synchronous and asynchronous error codes
- Delivery-receipt mechanism and its authentication scheme
- Rate limits, timeouts, retry guidance, maintenance windows
- Encoding and segmentation rules, and the exact **charging point** — on
  submission, on acceptance, or on delivery
- Refund treatment for failed and undelivered messages
- Idempotency semantics: is the same key safe, and for how long
- Sender-identity registration rules and lead times
- Permitted content and compliance requirements
- Support and incident escalation contacts

The charging point matters more than it sounds. This implementation charges on
**confirmed acceptance**. If the partner instead charges on submission or only
on delivery, `dispatchCampaign` has to change, not just a configuration value.

## Payment provider

Implement `PaymentProvider` in `src/server/providers/payments.ts`.

### `createCheckout({ organizationId, reference, pkg })`

`reference` is our business reference and must come back on every event for that
payment. Return the provider's checkout id and the URL to send the customer to.

### `verifyEvent(rawBody, headers)`

Return `null` unless the signature verifies over the raw body. A verified event
must supply: event id, our reference, type, amount in centavos, currency,
merchant id, environment, package code.

`ingestPaymentEvent` then checks all of those against what was recorded at
checkout before crediting anything, and rejects a mismatch.

### `reconcilePayment(reference)`

Server-to-server lookup, used when an event never arrived and to settle
disputes. It goes through the same apply path as a webhook, so it cannot
double-credit a payment whose event did arrive.

### Non-negotiable

- **A browser redirect never grants credit.** The customer controls the URL they
  return to. Credit comes from a verified event or from reconciliation.
- Deduplicate on **both** the event id and the business payment reference. The
  event-id index does not stop two *different* events crediting one payment; the
  payment's own status does.
- A chargeback larger than the remaining balance is recorded as debt and freezes
  sending. It is not clamped to zero.

### What we need in writing

- Provider selection, merchant account and environment identifiers
- Event authentication scheme and signing secrets
- Settlement timing and fees
- Refund, dispute and chargeback handling
- Tax treatment and invoice or official-receipt requirements for the Philippines
- Whether card details ever reach our infrastructure (they must not)

## Testing an adapter

The mock providers are the reference implementation. `MockSmsProvider` scripts
its behaviour from the last four digits of the recipient — `9001` rejects,
`9002` times out after accepting, `9003` fails transiently — which is how the
awkward paths are exercised deterministically in `dispatch.test.ts`.

A new adapter should pass the same tests with its own sandbox credentials before
being pointed at production.
