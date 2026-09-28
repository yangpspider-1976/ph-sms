# Live readiness checklist

What must be true before `APP_MODE=LIVE`. Nothing on this list blocks further
work in mock mode — the application is complete and testable without any of it.

Items are marked by who owns them. Most are not engineering tasks.

## Blocking — from the SMS partner

None of this can be guessed, and the adapter fails loudly rather than pretend.
See [ADAPTER-CONTRACT.md](ADAPTER-CONTRACT.md) for the shape each item takes.

- [ ] Sandbox and production base URLs, with credentials for both
- [ ] Request and response schemas, with real sample payloads
- [ ] Complete list of synchronous and asynchronous error codes, to map to our
      categories
- [ ] **Charging point** — on submission, on acceptance, or on delivery. This one
      changes code, not configuration: the implementation charges on confirmed
      acceptance
- [ ] Refund treatment for failed and undelivered messages
- [ ] **Idempotency semantics** — is re-sending the same key safe, and for how
      long. Until this is answered, an `UNKNOWN` submission is never retried
- [ ] Whether submissions can be queried after the fact
- [ ] Delivery-receipt mechanism and its authentication scheme
- [ ] Encoding and segmentation rules, which override the mock's 160/153/70/67
- [ ] Rate limits, timeouts, retry guidance, maintenance windows
- [ ] Sender-identity registration rules and lead times
- [ ] Permitted content and compliance requirements
- [ ] Support and incident escalation contacts

## Rate limiting needs the proxy header

The per-client rate limits on sign-in, sign-up and the public inquiry form key on the first address
in `x-forwarded-for`. Without that header the platform cannot tell one client from another, so
those checks are skipped rather than applied to a shared bucket — a shared bucket would let a
handful of failed attempts lock out every user.

**Before live:** confirm the load balancer or reverse proxy sets `x-forwarded-for`, and that it
strips any value the client sent, so the address cannot be spoofed to evade or to frame another
client. The per-account limits work regardless and are unaffected by this.


## Blocking — commercial

- [ ] **Approved unit pricing.** The demo value of PHP 1.00 per segment is a test
      setting and is deliberately not published on the pricing page
- [ ] Tax treatment and official-receipt/invoice requirements for the Philippines
- [ ] Refund policy for customers
- [ ] Credit package definitions and expiry, if any
- [ ] Contracted payment provider, merchant account, settlement terms and fees
- [ ] Chargeback and dispute handling process

## Blocking — legal and privacy

Owner: the Philippine DPO or legal adviser. Nothing in this repository is legal
advice, and the legal pages are marked as unwritten drafts rather than filled
with plausible text.

- [ ] Privacy notice
- [ ] Terms of service
- [ ] Acceptable use policy
- [ ] The processing basis relied on, and the notice given at collection
- [ ] **Retention periods.** The current windows are provisional development
      values
- [ ] Opt-out handling requirements, and whether an inbound reply route is needed
- [ ] Consent requirements for promotional messaging, aligned with the partner's
      carrier requirements

## Blocking — infrastructure

- [ ] Managed PostgreSQL with automated backups. The local embedded server is a
      development tool only and is not a production database
- [ ] **Durable worker hosting, separate from the web process.** Without a
      running worker, campaigns are accepted and funds are held but nothing is
      ever sent
- [ ] `SUPPRESSION_HMAC_KEY` and `DATA_ENCRYPTION_KEY` generated and stored in a
      secret manager, never in the repository
- [ ] `PAYMENT_MERCHANT_ID` set to the real merchant, not the demo placeholder
- [x] ~~A real email transport~~ — **built.** `MAIL_TRANSPORT=SMTP` with the
      `SMTP_*` variables sends through nodemailer; the sink remains the default.
      Still needs an actual mail provider account and `APP_BASE_URL` set
- [ ] TLS terminated, security headers verified in the deployed environment
- [x] ~~Monitoring endpoint~~ — **built.** `GET /api/health` for liveness and
      `?full=1` for the operational checks, machine-readable
- [ ] Something actually pointed at `/api/health`, with thresholds and an
      escalation path. The endpoint exists; nobody is watching it
- [ ] Log retention and redaction verified in the deployed environment

## Blocking — operational rehearsal

These are written but never executed. Each should be walked through before real
customer data exists.

- [x] ~~Backup restore rehearsed~~ — **done**, `npm run rehearse-restore`. It
      found that the audit log is restored away too, so the original recovery
      step was not executable; the opt-out journal
      (`npm run export-suppressions`) was built to close that
- [ ] Re-run the restore rehearsal against the **managed provider's** backup
      tooling. The local rehearsal used a database-level copy
- [x] ~~Key rotation rehearsed~~ — **done**, `npm run rotate-keys`, with a test
      that demonstrates what rotating without the previous key would break
- [ ] Incident response walked through
- [ ] Partner sandbox integration tested end to end
- [ ] UAT with a real business, on the sandbox
- [ ] Production admin MFA enrolled. The enrolment flow now exists at
      `/admin/mfa` (TOTP, verified against the RFC 6238 vectors, with recovery
      codes). It sits outside the admin layout so the first admin can reach it

## Blocking — engineering

Known gaps in the build itself:

- [x] ~~Team invitations~~ — **built.** Expiring, single-use, email- and
      role-bound, with the last Owner protected. 21 tests
- [x] ~~Accessibility audit~~ — **run.** axe-core against WCAG 2.1 A/AA across
      25 pages, in CI as `e2e/accessibility.spec.ts`. Found and fixed contrast
      failures in the muted text colour, notice bodies and the marketing
      annotations
- [ ] Manual screen-reader pass. The automated scan catches roughly a third of
      real problems and cannot tell whether a page reads sensibly aloud
- [x] ~~Responsive layout~~ — **tested** at 375px and 768px, asserting no page
      scrolls sideways, in `e2e/responsive.spec.ts`
- [ ] Verification on real hardware. Emulated viewports are not devices
- [x] ~~Load testing~~ — **measured**, `npm run benchmark`. At the 10,000-row
      cap: 46 ms to parse, 933 ms for per-row hashing and encryption, ~1.26 s
      total. The cap is justified; encryption dominates
- [ ] Decide whether imports at the cap should move to the worker. 1.26 s is
      acceptable synchronously but would not stay so if the cap were raised

## What LIVE changes automatically

Switching `APP_MODE` is not cosmetic. In LIVE:

- seeded demo logins and the demo login panel are gone;
- the local mail sink is gone;
- demo funding on approval stops;
- the demo checkout page and the demo sender-approval shortcut refuse to run;
- `requirePlatformAdmin()` additionally requires MFA on the session;
- `PartnerSmsProvider` and `UnconfiguredPaymentProvider` are selected, and both
  fail loudly until configured.

`liveReadinessGaps()` and `liveConfigGaps()` report what is still missing, and
`/admin/settings` displays them.

## What this checklist is not

It does not certify anything. It lists what is known to be outstanding. A
completed checklist means the known gaps are closed, not that the system has
been independently assessed — no security review, penetration test or privacy
impact assessment has been carried out.
