# User acceptance checklist

Prepared 2026-11-17. All boxes are intentionally open: automated tests do not
constitute acceptance by Gideon or the business owner. Use synthetic records in
MOCK staging and record the tested revision, browser, locale and evidence.

| Check | Steps and expected result | Accepted |
|---|---|---|
| Testing guide | Gideon runs the updated `PH_SMS_Testing_Guide.docx`, including its new tests (the "2.0" copy holds his 11 November results); attach results and any ambiguous wording | [ ] |
| Design review | Business owner reviews desktop and phone layouts, navigation, wording and all new pages | [ ] |
| Import mapping | Upload `Mobile,Given name,Department`; choose phone, first name and custom_1; preview, correct mapping and commit. Missing/duplicate destinations are explained | [ ] |
| Failed import | In Korean upload malformed CSV; summary, row-level errors and refused-download page are Korean | [ ] |
| Personalized send | Import two different first names; use `Hello {{first_name}}`; review resolved examples and recipient-dependent segment/cost totals; confirm | [ ] |
| Snapshot stability | Review a personalized send, edit a contact, then confirm. The accepted quote's rendered message and charge stay fixed | [ ] |
| Missing variable data | Use an unsupported variable or a recipient missing a required value; quote is blocked with an actionable message | [ ] |
| Promotional route | With the default setting the send page points promotions to the bulk quote, and the server refuses one. An admin switches Settings → Promotional messages to allow normal sending: a promotion to contacts with recorded consent goes through, unconsented recipients cannot pass, opt-outs stay excluded. Switch it back afterwards | [ ] |
| Scheduling | Compare current Manila time beside the date field; schedule, reload, cancel before submission and check held funds are released | [ ] |
| Reports | Filter by Manila dates, purpose and status; compare totals with campaign detail; export the same filtered report | [ ] |
| Export permissions | Viewer gets masked results; full recipient exports require the correct role; another organization's IDs disclose no records | [ ] |
| Admin report | Click Overview → Export report; one localized CSV download contains the displayed report's campaign information | [ ] |
| Pricing | Change demo segment price as admin; new quotes use it while existing valid quotes preserve their snapshot; history records the editor | [ ] |
| Email templates | Edit English and Korean wording; use only supported placeholders; trigger a demo verification/inquiry email and inspect the mail sink | [ ] |
| Inquiry workflow | Change an inquiry status once; customer/operator notifications are created; saving the same status does not duplicate them | [ ] |
| Sending pace | Lower demo provider pace in Settings; send multiple messages and observe spaced submissions across campaigns without extra charges | [ ] |
| Monitoring | Open System health; inspect active alerts, severity, evidence and response instructions; verify the JSON health output | [ ] |
| Roles | Repeat relevant flows as Owner, Sender, Viewer, Approver and Org Admin; restricted mutations are refused on the server | [ ] |
| Accessibility | Keyboard navigation, visible focus, language switching, screen reader, zoom and a real phone review | [ ] |

For each failed check record an ID, severity, reproduction steps, expected and
actual behavior, screenshot/log reference, owner and retest result in
[FINAL-DEFECT-REPORT.md](FINAL-DEFECT-REPORT.md). Acceptance requires all critical
and high defects resolved and explicit approval of any remaining exceptions.
Partner sandbox delivery, managed backup recovery and live activation have
separate gates in [LIVE-READINESS.md](LIVE-READINESS.md).
