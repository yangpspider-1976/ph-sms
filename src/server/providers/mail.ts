import "server-only";
import { db, type DbOrTx } from "@/server/db";
import { mailSink } from "@/server/db/schema";
import { env } from "@/server/env";

/**
 * Mail transport.
 *
 * Two implementations:
 *   - SinkMailer writes to the database and sends nothing. This is what runs in
 *     mock mode, and it is why the demo never emails a real person.
 *   - SmtpMailer sends for real, and refuses to start without credentials.
 *
 * `nodemailer` is imported dynamically so the mock path never loads it.
 */

export type MailMessage = {
  to: string;
  subject: string;
  body: string;
  /** Relative path turned into an absolute link by the transport. */
  link?: string | null;
};

export interface Mailer {
  readonly name: string;
  send(message: MailMessage, tx?: DbOrTx): Promise<void>;
}

/** Local sink. Nothing leaves the machine. */
export class SinkMailer implements Mailer {
  readonly name = "sink";

  async send(message: MailMessage, tx: DbOrTx = db): Promise<void> {
    await tx.insert(mailSink).values({
      toEmail: message.to,
      subject: message.subject,
      body: message.body,
      link: message.link ?? null,
    });
  }
}

export class MailNotConfiguredError extends Error {
  constructor(missing: string) {
    super(
      `SMTP is selected but ${missing} is not set. Mail would be silently dropped, ` +
        "so this fails instead. Set the SMTP_* variables or use MAIL_TRANSPORT=SINK.",
    );
    this.name = "MailNotConfiguredError";
  }
}

/**
 * Real SMTP delivery.
 *
 * A copy is still written to the sink table, so an operator can see what was
 * sent without reading the recipient's inbox. The body is not secret — these
 * are verification and invitation notices — but the copy is subject to the same
 * retention job as everything else.
 */
export class SmtpMailer implements Mailer {
  readonly name = "smtp";

  private transport: unknown;

  private async getTransport() {
    if (this.transport) return this.transport;

    if (!env.SMTP_HOST) throw new MailNotConfiguredError("SMTP_HOST");
    if (!env.SMTP_FROM) throw new MailNotConfiguredError("SMTP_FROM");

    const nodemailer = await import("nodemailer");

    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // Implicit TLS on 465; STARTTLS is negotiated on other ports.
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
    return this.transport;
  }

  async send(message: MailMessage, tx: DbOrTx = db): Promise<void> {
    const transport = (await this.getTransport()) as {
      sendMail: (options: Record<string, unknown>) => Promise<unknown>;
    };

    const url = message.link
      ? `${env.APP_BASE_URL.replace(/\/$/, "")}${message.link}`
      : null;

    await transport.sendMail({
      from: env.SMTP_FROM,
      to: message.to,
      subject: message.subject,
      text: url ? `${message.body}\n\n${url}` : message.body,
    });

    await new SinkMailer().send(message, tx);
  }
}

let cached: Mailer | null = null;

export function getMailer(): Mailer {
  if (cached) return cached;
  cached = env.MAIL_TRANSPORT === "SMTP" ? new SmtpMailer() : new SinkMailer();
  return cached;
}

export function setMailer(mailer: Mailer | null): void {
  cached = mailer;
}

/** Convenience wrapper used by the domain code. */
export async function sendMail(message: MailMessage, tx?: DbOrTx): Promise<void> {
  await getMailer().send(message, tx);
}
