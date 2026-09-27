import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env['SMTP_HOST'] ?? 'smtp.ethereal.email',
  port: Number(process.env['SMTP_PORT'] ?? 587),
  auth: {
    user: process.env['SMTP_USER'],
    pass: process.env['SMTP_PASS'],
  },
});

/**
 * Send an email using Ethereal SMTP.
 * Returns the message preview URL.
 */
export async function sendEmail(to: string, subject: string, body: string, senderEmail: string, senderName: string): Promise<string | false> {
  const from = senderName ? `"${senderName}" <${senderEmail}>` : senderEmail;
  
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: body, // For this take-home, we just use plain text. Could be HTML.
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.log(`[smtp] Sent email to ${to} (Preview: ${previewUrl})`);
  return previewUrl;
}
