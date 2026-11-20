import nodemailer from "nodemailer";

let missingSmtpWarningLogged = false;

export function warnMissingSmtpConfiguration() {
  if (missingSmtpWarningLogged) return;
  console.warn("SMTP_HOST tidak dikonfigurasi; email notifikasi tidak dapat dikirim di production.");
  missingSmtpWarningLogged = true;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

async function sendMail(email: string, subject: string, text: string, html: string) {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    if (process.env.NODE_ENV === "production") {
      warnMissingSmtpConfiguration();
      return false;
    }
    console.info(`SMTP tidak dikonfigurasi; email "${subject}" untuk ${email} tidak dikirim.`);
    return false;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    ...(user && pass ? { auth: { user, pass } } : {}),
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM?.trim() || "RuangKu <no-reply@ruangku.local>",
    to: email,
    subject,
    text,
    html,
  });
  return true;
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  if (!process.env.SMTP_HOST?.trim() && process.env.NODE_ENV !== "production") {
    console.info(`Tautan reset password untuk ${email}: ${resetUrl}`);
    return;
  }
  await sendMail(
    email,
    "Atur ulang password RuangKu",
    `Gunakan tautan berikut untuk membuat password baru. Tautan berlaku selama 30 menit:\n\n${resetUrl}\n\nJika Anda tidak meminta reset password, abaikan email ini.`,
    `<p>Gunakan tautan berikut untuk membuat password baru. Tautan berlaku selama 30 menit:</p><p><a href="${escapeHtml(resetUrl)}">Atur ulang password</a></p><p>Jika Anda tidak meminta reset password, abaikan email ini.</p>`
  );
}

export function createNotificationEmail(title: string, message: string) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return {
    subject: `RuangKu: ${title}`,
    text: `${title}\n\n${message}\n\nBuka aplikasi RuangKu untuk melihat detail.`,
    html: `<main style="font-family:Arial,sans-serif;color:#17243A"><h2>${safeTitle}</h2><p>${safeMessage}</p><p>Buka aplikasi RuangKu untuk melihat detail.</p></main>`,
  };
}

export async function sendNotificationEmail(email: string, title: string, message: string) {
  const content = createNotificationEmail(title, message);
  return sendMail(email, content.subject, content.text, content.html);
}
