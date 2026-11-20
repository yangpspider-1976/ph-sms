# Security and privacy handover checklist

Updated 2026-11-17. This records implementation evidence and review work; it is
not a security certification or approval of the draft policies. Check a box
only after the named reviewer attaches evidence for the release being accepted.

| Control | Implementation evidence | Acceptance still required |
|---|---|---|
| Identity and access | Hashed session tokens; server-side RBAC; platform-admin checks; TOTP and recovery codes | Review admin enrollment, recovery and account offboarding with the operator |
| Tenant isolation | Membership-derived organization scope; `isolation.test.ts`; scoped reports and exports | Run adversarial API checks in the intended staging environment |
| Recipient data | Encrypted numbers, keyed suppression hashes, masked screens and default exports | Inventory storage locations and approve access to full-number exports |
| Personalized messages | Per-recipient rendered text is encrypted; quote/campaign snapshots prevent later contact edits changing a send | Review retention and support access to message content |
| Consent and opt-outs | Consent metadata; promotional sending off by default (admin switch), with consent checks at quote, confirmation and dispatch when on; organization/global suppression, recheck at dispatch | DPO/business/partner approval of collection evidence, notices and opt-out process |
| Uploads/downloads | File/row limits, explicit column mapping, formula-safe CSV, authenticated downloads, export audit events | Exercise malicious CSVs and confirm spreadsheet behavior in the team's tools |
| Billing and dispatch | Integer centavos; reservations; idempotency; UNKNOWN query-only reconciliation; shared provider pacing | Verify partner charging, retry and throughput contracts before live adapter work |
| Input and abuse controls | Server validation, rate limits, content policy checks, approval holds | Review actual traffic limits and trusted ingress configuration |
| Secrets | Environment-based keys, previous-key support and rotation tooling | Assign key custodians; configure a secret manager and restricted runtime identities later |
| Audit and retention | Audit events, redaction jobs, retention windows and opt-out restore journal | Approve windows and storage; demonstrate jobs and off-database journal recovery on staging |
| Monitoring | Admin health dashboard and alert definitions in `MONITORING.md` | Assign on-call owners and connect an external alert destination later |
| Dependencies | Lockfile plus inventory below | Record an actual dependency/security scan and triage results before release |

## Reviewer sign-off

- [ ] Engineering: review authorization boundaries, migration, billing and retry invariants.
- [ ] Security reviewer: threat review, dependency scan and targeted penetration testing; attach findings.
- [ ] DPO/legal: approve data flow, privacy/consent wording, promotional rules and retention.
- [ ] Operations: rehearse managed backups, restore plus opt-out journal, key rotation and rollback.
- [ ] Business owner: approve roles, rates, support process and acceptable-use decisions.

Record reviewer, date, release revision, evidence link, exceptions and remediation
owner for each item. No external scan, legal approval or production configuration
is implied by this checklist.

## Dependency inventory

Declared versions are in `package.json`; exact resolved versions and transitive
dependencies are pinned in `package-lock.json`. Node is pinned to 24.x by the
package's engine requirement.

| Dependency group | Packages | Purpose / boundary |
|---|---|---|
| Web runtime | next, react, react-dom | App Router, server rendering, forms and browser UI |
| Database | drizzle-orm, postgres | Typed queries, transactions, PostgreSQL connections |
| Validation and import | zod, papaparse | Server input validation and CSV parsing |
| Authentication and mail | bcryptjs, nodemailer | Password hashing and optional SMTP transport |
| Server boundary | server-only | Prevent server modules from entering client bundles |
| Build/types | typescript, tsx, drizzle-kit, dotenv, @types/* | Compilation, scripts, migrations and type declarations |
| Styling | tailwindcss, @tailwindcss/postcss | CSS compilation |
| Verification | vitest, @playwright/test, @axe-core/playwright, axe-core | Unit/integration, browser and accessibility checks |
| Local database only | embedded-postgres | Development/test PostgreSQL; never a production dependency |

Reproduce a version inventory with `npm ls --all --json`; review the lockfile
alongside a release-specific vulnerability scan. No claim that the dependency
tree is free of vulnerabilities has been made.
