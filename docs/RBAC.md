# Roles and permissions

Four roles. Three belong to an organization; Platform Admin is a property of the
user account and lives on a separate console.

Defined in [`src/server/auth/rbac.ts`](../src/server/auth/rbac.ts) and enforced
in [`src/server/auth/context.ts`](../src/server/auth/context.ts).

## Matrix

| Permission | Owner | Sender | Viewer |
|---|:--:|:--:|:--:|
| `campaign.view` | ● | ● | ● |
| `campaign.create` | ● | ● | |
| `campaign.send` | ● | ● | |
| `campaign.test` | ● | ● | |
| `campaign.cancel` | ● | ● | |
| `contacts.view` | ● | ● | ● |
| `contacts.manage` | ● | | |
| `suppression.view` | ● | ● | ● |
| `suppression.manage` | ● | | |
| `templates.view` | ● | ● | ● |
| `templates.manage` | ● | ● | |
| `sender.view` | ● | ● | ● |
| `sender.apply` | ● | | |
| `billing.view` | ● | ● | ● |
| `billing.manage` | ● | | |
| `team.view` | ● | | |
| `team.manage` | ● | | |
| `reports.view` | ● | ● | ● |
| `reports.export.masked` | ● | ● | ● |
| `reports.export.full` | ● | | |
| `settings.manage` | ● | | |

## What each role is for

**Organization Owner** — the account holder. Billing, team, contacts, opt-outs,
sender applications, sending and reports. The only role that can export
unmasked phone numbers, and the only one that can spend money.

**Sender** — someone who sends campaigns day to day. They can compose, send,
schedule and cancel within the organization's limits, and manage templates. They
cannot change billing, roles, the opt-out list, pricing or verification, and
cannot reveal full numbers. The split exists so a business can let staff send
without handing over the company card or the opt-out list.

**Viewer** — read-only, masked. Useful for a manager or an auditor. Can take a
masked export; cannot send, spend, or unmask.

**Platform Admin** — operates the platform, not a tenant. Verification
decisions, sender approvals, limits, the inquiry pipeline, platform-wide
suppression and the audit log. It is *not* an organization role: a platform
admin has no implicit access to a tenant's send screens, and there is no
"impersonate this customer" control.

## How it is enforced

Every check runs on the server against the authenticated user's membership:

```ts
const auth = await authorize("reports.export.full");
if (!auth.ok) return { ok: false, error: auth.error.message };
```

The UI hides what a role cannot do, but hiding a button is a courtesy. The
server refuses the action either way — the export route returns 403 to a Viewer
asking for `scope=full` whether or not a button was rendered.

`requirePlatformAdmin()` additionally demands MFA on the current session when
`APP_MODE=LIVE`.

## Scope resolution

The authorized organization comes from the membership table, never from the
request:

```ts
const list = await getMemberships(user.id);
const org = list.find((m) => m.organizationId === requested) ?? list[0];
```

The active-organization cookie only *selects* among organizations the user
already belongs to. Setting it to a stranger's id yields the user's own first
membership, not access.

## Team invitations

The rules are written and the schema supports them — invitations expire, are
single-use, bind both the email and the role, cannot escalate privilege, and
cannot remove the last Owner. **The screen is not built.** Memberships are
currently created by the seed or by signup.

## Not covered by tests

The permission matrix is exercised through the export route (Viewer 403 on full,
200 on masked; Owner 200 on full) and through cross-tenant isolation tests. There
is no test that walks every cell of the table above.
