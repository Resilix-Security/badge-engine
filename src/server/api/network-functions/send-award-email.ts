import "server-only";
import nodemailer from "nodemailer";
import { EmailClient } from "@azure/communication-email";
import { env } from "~/env.mjs";
import logger from "shared/utils/logger/createLogger";
import { fetchImageBuffer } from "~/lib/fetch-image-buffer";

// Brand palette, pulled from style-dictionary/properties/color/base.json —
// email clients strip <style> blocks and Tailwind classes, so this has to be
// inline styles with literal values rather than the app's usual utility classes.
const COLOR = {
  bluePrimary: "#348EC7", // blue-3, matches the app's .btn background
  blueDark: "#2A7AAC", // blue-4
  blueText: "#246289", // blue-5
  ink: "#000000", // neutral-5
  gray5: "#454545",
  gray4: "#777777",
  gray3: "#A3A3A3",
  gray2: "#E6E6E6",
  gray1: "#F4F4F4",
  white: "#FFFFFF",
} as const;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export type AwardEmailInput = {
  to: string;
  recipientName?: string | null;
  credentialName: string;
  issuerName: string;
  credentialUrl: string;
  /** Image.id of the awarded credential's badge image, if any (data URI or remote URL). */
  imageId?: string | null;
};

const INLINE_IMAGE_CID = "badge-image";

async function buildAwardEmail({
  to,
  recipientName,
  credentialName,
  issuerName,
  credentialUrl,
  imageId,
}: AwardEmailInput) {
  const greetingName = recipientName ? escapeHtml(recipientName) : "there";
  const safeCredentialName = escapeHtml(credentialName);
  const safeIssuerName = escapeHtml(issuerName);
  const safeUrl = escapeHtml(credentialUrl);
  const subject = `You've earned "${credentialName}" from ${issuerName}`;

  let imageBuffer: Buffer | undefined;
  let imageHtml = "";

  if (imageId) {
    try {
      imageBuffer = await fetchImageBuffer(imageId);
      imageHtml = `
        <tr>
          <td align="center" style="padding:28px 32px 0 32px;">
            <img src="cid:${INLINE_IMAGE_CID}" width="120" height="120" alt="${safeCredentialName}" style="display:block;border-radius:12px;border:1px solid ${COLOR.gray2};" />
          </td>
        </tr>`;
    } catch (error) {
      logger.error("Could not attach badge image to award email: ", error);
    }
  }

  const html = `
<body style="margin:0;padding:0;background-color:${COLOR.gray1};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR.gray1};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:${COLOR.white};border-radius:16px;border:1px solid ${COLOR.gray2};">
          <tr>
            <td style="padding:28px 32px 0 32px;">
              <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLOR.blueDark};">Badge Engine</p>
            </td>
          </tr>
          ${imageHtml}
          <tr>
            <td align="center" style="padding:24px 32px 4px 32px;">
              <p style="margin:0 0 4px 0;font-size:15px;color:${COLOR.gray4};">Hi ${greetingName}, ${safeIssuerName} has awarded you</p>
              <h1 style="margin:0;font-size:24px;line-height:1.3;color:${COLOR.ink};font-weight:700;">${safeCredentialName}</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 32px 32px 32px;">
              <a href="${safeUrl}" style="display:inline-block;padding:13px 32px;background-color:${COLOR.bluePrimary};color:${COLOR.white};font-weight:700;font-size:15px;text-decoration:none;border-radius:999px;">View your credential</a>
            </td>
          </tr>
        </table>
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <tr>
            <td align="center" style="padding:20px 8px 0 8px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:${COLOR.gray3};">
                If the button doesn't work, copy this link into your browser:<br />
                <a href="${safeUrl}" style="color:${COLOR.gray3};">${safeUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>`;

  const text = `Hi ${recipientName ?? "there"},\n\n${issuerName} has awarded you the credential "${credentialName}".\n\nView it here: ${credentialUrl}`;

  return { to, subject, html, text, imageBuffer };
}

const smtpTransporter = (() => {
  if (env.EMAIL_PROVIDER !== "smtp") return null;
  if (!env.SMTP_HOST) {
    throw new Error("SMTP_HOST is required when EMAIL_PROVIDER=smtp");
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
})();

async function sendViaSmtp(
  message: Awaited<ReturnType<typeof buildAwardEmail>>,
) {
  if (!smtpTransporter) {
    throw new Error("SMTP transporter is not configured");
  }

  await smtpTransporter.sendMail({
    from: env.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.imageBuffer
      ? [
          {
            filename: "badge.png",
            content: message.imageBuffer,
            cid: INLINE_IMAGE_CID,
          },
        ]
      : [],
  });
}

const acsClient = (() => {
  if (env.EMAIL_PROVIDER !== "acs") return null;
  if (!env.ACS_CONNECTION_STRING) {
    throw new Error(
      "ACS_CONNECTION_STRING is required when EMAIL_PROVIDER=acs",
    );
  }
  return new EmailClient(env.ACS_CONNECTION_STRING);
})();

async function sendViaAcs(message: Awaited<ReturnType<typeof buildAwardEmail>>) {
  if (!acsClient) {
    throw new Error("Azure Communication Services email client is not configured");
  }

  const poller = await acsClient.beginSend({
    senderAddress: env.EMAIL_FROM,
    content: {
      subject: message.subject,
      html: message.html,
      plainText: message.text,
    },
    recipients: {
      to: [{ address: message.to }],
    },
    attachments: message.imageBuffer
      ? [
          {
            name: "badge.png",
            contentType: "image/png",
            contentInBase64: message.imageBuffer.toString("base64"),
            contentId: INLINE_IMAGE_CID,
          },
        ]
      : [],
  });

  const result = await poller.pollUntilDone();

  if (result.status !== "Succeeded") {
    throw new Error(
      `ACS email send did not succeed (status: ${result.status}, error: ${result.error?.message ?? "unknown"})`,
    );
  }
}

export async function sendAwardEmail(input: AwardEmailInput) {
  const message = await buildAwardEmail(input);

  const send = env.EMAIL_PROVIDER === "acs" ? sendViaAcs : sendViaSmtp;

  await send(message).catch((error) => {
    logger.error(
      `Error sending award email via ${env.EMAIL_PROVIDER}: `,
      error,
    );
    throw error;
  });
}
