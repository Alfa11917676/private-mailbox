import nodemailer, { type SendMailOptions } from "nodemailer";
import { env } from "./env.js";

/**
 * SMTP send via nodemailer (CLAUDE.md locked stack). We compose the raw RFC822
 * message once so the exact same bytes are both sent and appended to Sent.
 */
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465, // implicit TLS on 465; STARTTLS on 587
      requireTLS: env.smtpPort !== 465,
      auth: { user: env.mailUser, pass: env.mailPassword },
    });
  }
  return transporter;
}

// Build-only transport: compiles a mail object to a raw Buffer without sending.
const rawBuilder = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: "\r\n",
});

export async function buildRawMessage(mail: SendMailOptions): Promise<Buffer> {
  const info = await rawBuilder.sendMail(mail);
  // With streamTransport+buffer, `message` is the compiled Buffer.
  return info.message as Buffer;
}

export async function sendRawMessage(
  envelope: { from: string; to: string[] },
  raw: Buffer,
): Promise<void> {
  await getTransporter().sendMail({ envelope, raw });
}

/** Confirm SMTP credentials/connectivity without sending anything. */
export async function verifyTransport(): Promise<boolean> {
  return getTransporter().verify();
}
