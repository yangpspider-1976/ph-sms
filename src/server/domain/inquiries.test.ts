import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db, resetDb } from "@/test/db";
import { inquiries, mailSink, users } from "@/server/db/schema";
import { setMailer, SinkMailer } from "@/server/providers/mail";
import { updateInquiry } from "./inquiries";
import { saveEmailTemplate } from "./email-templates";

let inquiryId: string;
let actor: { id: string; fullName: string };
let operatorId: string;
beforeEach(async () => {
  await resetDb();
  setMailer(new SinkMailer());
  const people = await db.insert(users).values([
    { email: "actor@example.test", fullName: "Admin One", passwordHash: "x", isPlatformAdmin: true },
    { email: "operator@example.test", fullName: "Admin Two", passwordHash: "x", isPlatformAdmin: true },
  ]).returning();
  actor = { id: people[0]!.id, fullName: people[0]!.fullName };
  operatorId = people[1]!.id;
  const [inquiry] = await db.insert(inquiries).values({
    company: "Sample Company", contactName: "지민", contactEmail: "customer@example.test",
    estimatedVolume: 500, frequency: "monthly", purpose: "PROMOTIONAL", audience: "Consenting customers",
    sampleMessage: "Our seasonal sale", locale: "ko",
  }).returning({ id: inquiries.id });
  inquiryId = inquiry!.id;
});
afterEach(() => setMailer(null));
afterAll(closeDb);

const update = () => updateInquiry({ inquiryId, status: "REVIEWING", note: "Internal budget discussion", ownerUserId: operatorId, actor, actorLocale: "en" });

describe("inquiry status notifications", () => {
  it("notifies the customer in their language and the assigned operator without exposing internal notes", async () => {
    expect(await update()).toMatchObject({ ok: true, statusChanged: true, customerEmailed: true, operatorEmailed: true });
    const mails = await db.select().from(mailSink);
    expect(mails).toHaveLength(2);
    const customer = mails.find((mail) => mail.toEmail === "customer@example.test")!;
    expect(customer.body).toContain("지민");
    expect(customer.subject).toMatch(/[가-힣]/);
    expect(mails.every((mail) => !mail.body.includes("Internal budget"))).toBe(true);
    expect(mails.find((mail) => mail.toEmail === "operator@example.test")!.link).toBe("/admin/inquiries");
  });

  it("does not send duplicates when the same status is saved concurrently", async () => {
    const outcomes = await Promise.all([update(), update()]);
    expect(outcomes.filter((result) => result.ok && result.statusChanged)).toHaveLength(1);
    expect(await db.select().from(mailSink)).toHaveLength(2);
  });

  it("does not email an operator about their own update", async () => {
    expect(await updateInquiry({ inquiryId, status: "CONTACTED", note: null, ownerUserId: actor.id, actor, actorLocale: "en" })).toMatchObject({ ok: true, customerEmailed: true, operatorEmailed: false });
    expect(await db.select().from(mailSink)).toHaveLength(1);
  });

  it("uses the customer's customized email wording", async () => {
    await saveEmailTemplate({ key: "inquiryCustomer", locale: "ko", subject: "{{company}} 안내", body: "{{name}}: {{status}}", actorUserId: actor.id });
    await update();
    const [mail] = await db.select().from(mailSink).where(eq(mailSink.toEmail, "customer@example.test"));
    expect(mail!.subject).toBe("Sample Company 안내");
    expect(mail!.body).toContain("지민:");
  });

  it("refuses a non-admin assignee without changing the inquiry or sending mail", async () => {
    await db.update(users).set({ isPlatformAdmin: false }).where(eq(users.id, operatorId));
    expect(await update()).toEqual({ ok: false, code: "NOT_AN_OPERATOR" });
    const [inquiry] = await db.select().from(inquiries).where(eq(inquiries.id, inquiryId));
    expect(inquiry!.status).toBe("NEW");
    expect(await db.select().from(mailSink)).toHaveLength(0);
  });

  it("rolls back the status and local mail when notification recording fails", async () => {
    let calls = 0;
    setMailer({ name: "failing-test", async send(message, tx) {
      if (++calls === 2) throw new Error("Mail recording failed");
      await new SinkMailer().send(message, tx);
    } });
    await expect(update()).rejects.toThrow("Mail recording failed");
    const [inquiry] = await db.select().from(inquiries).where(eq(inquiries.id, inquiryId));
    expect(inquiry!.status).toBe("NEW");
    expect(await db.select().from(mailSink)).toHaveLength(0);
  });
});
